// Spell check: Windows' own spell checker (the one Edge and Office use), in
// the language Windows is set to, so a word added to the dictionary here is
// known to them too, and theirs here. The checker is a COM object that stays
// on the thread that made it, so one thread keeps it and answers in turn.
// Without one (an unsupported language, say), nothing is ever misspelled.
use std::sync::{mpsc, Mutex, OnceLock};

enum Job {
    Check(Vec<String>, mpsc::Sender<Vec<Vec<[u32; 2]>>>),
    Suggest(String, mpsc::Sender<Vec<String>>),
    Add(String, mpsc::Sender<()>),
    Ignore(String, mpsc::Sender<()>),
}

fn jobs() -> &'static Mutex<mpsc::Sender<Job>> {
    static JOBS: OnceLock<Mutex<mpsc::Sender<Job>>> = OnceLock::new();
    JOBS.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<Job>();
        std::thread::spawn(move || checker::run(rx));
        Mutex::new(tx)
    })
}

fn ask<T: Default>(job: impl FnOnce(mpsc::Sender<T>) -> Job) -> T {
    let (tx, rx) = mpsc::channel();
    if jobs().lock().map(|s| s.send(job(tx))).is_err() {
        return T::default();
    }
    rx.recv().unwrap_or_default()
}

// Each text's misspellings: where each starts and how long it is, in UTF-16
// units, the same as JavaScript's string indexes.
#[tauri::command(async)]
pub fn spell_check(texts: Vec<String>) -> Vec<Vec<[u32; 2]>> {
    let count = texts.len();
    let mut found = ask(|tx| Job::Check(texts, tx));
    found.resize(count, Vec::new());
    found
}

#[tauri::command(async)]
pub fn spell_suggest(word: String) -> Vec<String> {
    ask(|tx| Job::Suggest(word, tx))
}

// Into the Windows dictionary, for good.
#[tauri::command(async)]
pub fn spell_add(word: String) {
    ask(|tx| Job::Add(word, tx))
}

// Until Cura closes.
#[tauri::command(async)]
pub fn spell_ignore(word: String) {
    ask(|tx| Job::Ignore(word, tx))
}

#[cfg(windows)]
mod checker {
    use super::Job;
    use std::sync::mpsc;
    use windows::core::{HSTRING, PWSTR};
    use windows::Win32::Foundation::S_OK;
    use windows::Win32::Globalization::{
        GetUserDefaultLocaleName, ISpellChecker, ISpellCheckerFactory, SpellCheckerFactory, CORRECTIVE_ACTION_GET_SUGGESTIONS, CORRECTIVE_ACTION_REPLACE,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, IEnumString, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};

    // The checker for Windows' language, or US English, or any it has.
    fn open() -> Option<ISpellChecker> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let factory: ISpellCheckerFactory = CoCreateInstance(&SpellCheckerFactory, None, CLSCTX_INPROC_SERVER).ok()?;
            let mut buf = [0u16; 85];
            let n = GetUserDefaultLocaleName(&mut buf);
            let mine = if n > 1 { String::from_utf16_lossy(&buf[..(n - 1) as usize]) } else { String::new() };
            let supported = |tag: &str| !tag.is_empty() && factory.IsSupported(&HSTRING::from(tag)).map(|b| b.as_bool()).unwrap_or(false);
            let tag = if supported(&mine) {
                mine
            } else if supported("en-US") {
                "en-US".to_string()
            } else {
                strings(&factory.SupportedLanguages().ok()?, 1).into_iter().next()?
            };
            factory.CreateSpellChecker(&HSTRING::from(tag)).ok()
        }
    }

    // Up to `max` strings from a list Windows made (each freed after).
    unsafe fn strings(list: &IEnumString, max: usize) -> Vec<String> {
        let mut out = Vec::new();
        while out.len() < max {
            let mut one = [PWSTR::null()];
            let mut got = 0u32;
            let hr = unsafe { list.Next(&mut one, Some(&mut got)) };
            if hr != S_OK || got == 0 {
                break;
            }
            out.push(unsafe { one[0].to_string() }.unwrap_or_default());
            unsafe { CoTaskMemFree(Some(one[0].0 as _)) };
        }
        out
    }

    // Words to look up again: the ones Windows would suggest for, or replace
    // (a common slip like "teh"). A repeated word ("the the") isn't flagged.
    fn check(c: &ISpellChecker, text: &str) -> Vec<[u32; 2]> {
        let mut out = Vec::new();
        if text.trim().is_empty() {
            return out;
        }
        let Ok(errors) = (unsafe { c.Check(&HSTRING::from(text)) }) else { return out };
        loop {
            let mut next = None;
            if unsafe { errors.Next(&mut next) } != S_OK {
                break;
            }
            let Some(e) = next else { break };
            let action = unsafe { e.CorrectiveAction() }.unwrap_or_default();
            if action != CORRECTIVE_ACTION_GET_SUGGESTIONS && action != CORRECTIVE_ACTION_REPLACE {
                continue;
            }
            if let (Ok(start), Ok(len)) = (unsafe { e.StartIndex() }, unsafe { e.Length() }) {
                out.push([start, len]);
            }
        }
        out
    }

    pub fn run(rx: mpsc::Receiver<Job>) {
        let c = open();
        for job in rx {
            match job {
                Job::Check(texts, tx) => {
                    let _ = tx.send(texts.iter().map(|t| c.as_ref().map(|c| check(c, t)).unwrap_or_default()).collect());
                }
                Job::Suggest(word, tx) => {
                    let list = c.as_ref().and_then(|c| unsafe { c.Suggest(&HSTRING::from(word.as_str())) }.ok());
                    let _ = tx.send(list.map(|l| unsafe { strings(&l, 6) }).unwrap_or_default());
                }
                Job::Add(word, tx) => {
                    if let Some(c) = &c {
                        let _ = unsafe { c.Add(&HSTRING::from(word.as_str())) };
                    }
                    let _ = tx.send(());
                }
                Job::Ignore(word, tx) => {
                    if let Some(c) = &c {
                        let _ = unsafe { c.Ignore(&HSTRING::from(word.as_str())) };
                    }
                    let _ = tx.send(());
                }
            }
        }
    }
}

#[cfg(not(windows))]
mod checker {
    use super::Job;
    use std::sync::mpsc;

    pub fn run(rx: mpsc::Receiver<Job>) {
        for job in rx {
            match job {
                Job::Check(texts, tx) => drop(tx.send(vec![Vec::new(); texts.len()])),
                Job::Suggest(_, tx) => drop(tx.send(Vec::new())),
                Job::Add(_, tx) | Job::Ignore(_, tx) => drop(tx.send(())),
            }
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn finds_a_misspelling_and_suggests_for_it() {
        let found = spell_check(vec!["This is a sentense with a mistake.".into(), "All fine here.".into()]);
        if found[0].is_empty() {
            // No spell checker for this PC's language: nothing to test.
            return;
        }
        assert_eq!(found[0], vec![[10, 8]]);
        assert!(found[1].is_empty());
        assert!(spell_suggest("sentense".into()).iter().any(|s| s == "sentence"));
    }
}
