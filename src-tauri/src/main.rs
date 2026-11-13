// Hides the extra console window that would otherwise open next to the app on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    soundboard_lib::run()
}
