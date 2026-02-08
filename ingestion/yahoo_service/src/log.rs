use std::{fs::{self, File}, io::Write, sync::OnceLock};
use log::{Level, Log};
use tokio::sync::mpsc;

pub use log::{error, warn};

type LogMessage = String;

static LOGGER: OnceLock<AsyncLogger> = OnceLock::new();

pub struct AsyncLogger {
    sender: mpsc::Sender<LogMessage>,
}

impl Log for AsyncLogger {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        metadata.level() <= Level::Info
    }

    fn log(&self, record: &log::Record) {
        let file_locator = if let Some(file) = record.file() {
            let pat = format!("{}/src/", record.target());
            let stripped = file.strip_prefix(&pat);
            if let Some(filename) = stripped {
                filename
            } else {
                file
            }
        } else {
            "Unknown"
        };

        let line_locator = if let Some(line) = record.line() {
            line.to_string()
        } else {
            "Unknown".to_string()
        };

        let locator = format!("({file_locator} : {line_locator})");

        if self.enabled(record.metadata()) {
            let log_entry = format!(
                "[{}] {} {} {} - {}\n",
                chrono::Local::now(),
                record.level(),
                record.target(),
                locator,
                record.args()
            );

            let _ = self.sender.try_send(log_entry);
        }
    }

    fn flush(&self) {}
}

pub async fn log_writer_task(mut receiver: mpsc::Receiver<LogMessage>, log_file_path: String) {
    if let Err(e) = fs::create_dir_all(&log_file_path) {
        error!("Failed to create log directory: {}", e);
        warn!("Continuing, logs will not be stored...");
    }
    
    let mut yahoo = match File::create(format!("{}/yahoo.log", log_file_path)) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("Fatal: Could not create log file at {:?}: {}", "yahoo.log", e);
            return;
        }
    };

    println!("Starting async log writer task...");

    while let Some(msg) = receiver.recv().await {
        println!("{}", msg);

        if let Err(e) = yahoo.write_all(msg.as_bytes()) {
            eprintln!("Error writing log data to disk: {}", e);
        }
    }

    println!("Log writer task finished.");
}

const LOG_CHANNEL_CAPACITY: usize = 1000; 

pub fn init_async_logger(log_path: &str) -> Result<(), log::SetLoggerError> {
    let (sender, receiver) = mpsc::channel(LOG_CHANNEL_CAPACITY);

    let logger = AsyncLogger { sender };

    let res = log::set_logger(LOGGER.get_or_init(|| logger))
        .map(|()| log::set_max_level(log::LevelFilter::Debug));

    if res.is_ok() {
        tokio::spawn(log_writer_task(receiver, log_path.to_owned()));
    }

    res
}
