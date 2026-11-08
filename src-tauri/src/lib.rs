//! Holodeck desktop shell. The app itself is the web build in `dist/`; card data and images are
//! fetched from Scryfall by the web page (Scryfall allows this), so nothing else lives here.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Holodeck");
}
