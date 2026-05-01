# 📅 CalSync — Smart Calendar Import Extension

CalSync is a Chrome Extension that helps you instantly convert tables from Notion, Google Docs, or Google Sheets into calendar events — saving time and eliminating manual entry.

---

## 🚀 Features

- 📥 Import Tables to Calendar  
  Detects tables and converts rows into structured calendar events.

- ⚡ One-Click Action  
  Injected "Import to Calendar" button directly inside supported pages.

- 🎨 Modern UI (Glassmorphism + Brutalism)  
  Clean, minimal, slightly bold UI for better usability.

- 🌙 Auto Dark Mode  
  Switches between light (day) and dark (night) automatically.

- 🔐 Secure Authentication  
  Handles calendar API authentication via background script.

- ⚡ Performance Optimized  
  Lightweight scripts with minimal impact on page performance.

---

## 🧠 How It Works

1. Content script scans the page for tables  
2. Injects an "Import to Calendar" button  
3. Extracts structured data (date, time, event name)  
4. Sends data to background script  
5. Background script communicates with calendar API  
6. Events are created automatically  

---

## 🛠️ Tech Stack

- JavaScript (Vanilla)
- Chrome Extension APIs
- HTML + CSS (Glassmorphism UI)
- Background & Content Scripts Architecture

---

## 📂 Project Structure
CalSync/
│── manifest.json
│── popup.html
│── popup.js
│── popup.css
│── background.js
│── contentScript.js
│── assets/



---
🧪 Usage
Open Notion / Google Docs / Google Sheets
Find a table with event data
Click "Import to Calendar"
Events will be processed and added

---

⚠️ Current Limitations
Table format must be structured (date/time columns required)
Limited parsing for complex table formats
API integration may require setup (depending on provider)

---

🛣️ Roadmap
 Google Calendar full integration
 AI-based table detection
 Custom field mapping UI
 Multi-calendar support
 Better error handling
 
 ---
 📜 License

This project is open-source and available under the MIT License.
---

💡 Author

Built by Ashutosh
Focused on building useful, performance-first web tools.

---
⭐ Support

If you find this project useful:

Star the repo ⭐
Share with others 🚀