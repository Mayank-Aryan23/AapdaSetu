# AapdaSetu (Disaster Response System)
Theme: AI for Societal Good | Status: MVP Complete

AapdaSetu (Bridge in Calamity) is a unified disaster management platform that closes the "Information-to-Action" gap. It uses Real-time Geofencing, AI Automation, and Resource Optimization to connect Government Authorities with Citizens instantly during crises.

**🚩 The Problem**
Current disaster management suffers from a significant lag:


Fragmented Data: Alerts exist in silos (News, TV, Radio) but aren't actionable.


Reactive Response: Authorities lack a real-time view of ground reality.


Panic: Mass broadcasting causes panic in safe zones due to lack of geofencing.

💡 **The Solution**
A dual-portal web platform:

Mission Control (Admin): An AI-powered dashboard to visualize threats, verify automated alerts, and deploy resources.


Citizen Portal (Public): A mobile-first app for hyper-local warnings, SOS reporting, and AI safety guidance.


🌟#Key Features
🏛️ **For Government (Admin Portal)**

🤖 AI Watchdog (n8n): Automatically scrapes weather news (IMD/Twitter) every 15 mins and drafts alerts using Google Gemini.


Human-in-the-Loop: Alerts are "Pending" until an Admin clicks Verify & Broadcast, preventing AI hallucinations.

🗺️ Live Situational Map: Google Maps integration showing Red Zones (Alerts) and Blue Pins (Citizen SOS) in real-time.


🚚 AI Resource Allocation: Algorithms suggest the nearest "Available" assets (NDRF/Medical) for incoming reports based on proximity and type.

📊 Post-Disaster Analytics: Automated charts comparing response times against historical data.

📱 **For Citizens (User Portal)**
📍 Geofenced Alerts: The screen turns RED only if the user is inside the disaster radius (e.g., 50km). Safe zones stay Green.


🆘 One-Tap Reporting: Submit "Medical" or "Flood" reports with GPS location and photos directly to the Admin Map.


💬 Context-Aware Chatbot: A Gemini-powered assistant that knows where the user is and what the disaster is, providing specific survival guides.
