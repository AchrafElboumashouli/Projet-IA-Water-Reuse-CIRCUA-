# 📊 Step 2 — Real-Time Monitoring & Alerts

This branch contains the implementation of **Step 2** of the **Smart Water Quality System** project.

The objective of this step is to provide a complete monitoring platform for real-time water quality data, allowing users to visualize sensor measurements, analyze historical trends, compare multiple sensor sets, and receive alerts when abnormal conditions occur.

---

# 🎯 Objectives

- Display real-time sensor data.
- Visualize historical measurements.
- Compare multiple sensor sets.
- Allow custom date and time selection.
- Generate alerts for abnormal water quality values.
- Provide an intuitive and responsive dashboard.

---

# 📊 Monitored Parameters

The dashboard displays the following water quality parameters:

| Parameter | Description |
|-----------|-------------|
| pH | Water acidity/basicity |
| Temperature | Water temperature (°C) |
| Electrical Conductivity (EC) | Mineral concentration |
| Turbidity | Water clarity |
| Dissolved Oxygen (DO) | Oxygen concentration |
| Sensor Set | Sensor group identifier |

---

# 🖥️ Dashboard Features

## 📈 Real-Time Monitoring

Display live sensor measurements as they are received from the backend.

Features:

- Live updates
- Current sensor status
- Latest measurements
- Sensor connectivity status

---

## 📉 Historical Data Visualization

Users can explore historical sensor data using interactive charts.

Supported options:

- Hourly view
- Daily view
- Weekly view
- Monthly view
- Custom date range

---

## 📊 Multi-Set Comparison

Compare measurements from multiple sensor sets on the same chart.

Example:

```
Set 1 ──────────────
                   \
                    > Combined Chart
                   /
Set 2 ──────────────
```

This allows users to evaluate differences between monitoring locations or experimental setups.

---

## 🚨 Alert System

Generate alerts when sensor values exceed predefined thresholds.

Example conditions:

| Parameter | Example Threshold |
|-----------|-------------------|
| pH | Outside acceptable range |
| Temperature | Above configured limit |
| EC | Above configured limit |
| Turbidity | Excessive turbidity |
| DO | Below acceptable level |

Alert types:

- Warning
- Critical
- Notification

---

# 🔄 System Workflow

```
ESP32 Sensors
       │
       ▼
ThingSpeak API / MQTT
       │
       ▼
Backend API
       │
       ▼
Database
       │
       ▼
Dashboard
       │
       ├──────────► Real-Time Charts
       ├──────────► Historical Charts
       ├──────────► Multi-Set Comparison
       └──────────► Alerts
```

---

# 📁 Project Structure

```
step-2/

frontend/
├── dashboard/
├── charts/
├── alerts/
├── components/
├── pages/

backend/
├── api/
├── websocket/
├── services/

README.md
```

---

# 🛠️ Technologies

- React / Next.js
- Tailwind CSS
- Recharts / Chart.js
- FastAPI / Flask
- REST API
- WebSocket
- MQTT
- PostgreSQL
- Docker

---

# ✨ Dashboard Modules

- Home Dashboard
- Live Monitoring
- Historical Data
- Sensor Comparison
- Alert Center
- Sensor Status
- System Statistics

---

# 🔌 Data Sources

The dashboard retrieves data from:

- ThingSpeak API
- MQTT Broker
- Backend REST API
- Database

---

# ▶️ Running the Project

Clone the repository:

```bash
git clone https://github.com/<username>/Projet-IA-Water-Reuse-CIRCUA-.git
```

Switch to the branch:

```bash
git checkout step-2
```

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

---

# 📌 Deliverables

- Real-time dashboard
- Historical visualization
- Interactive charts
- Multi-set comparison
- Alert management
- Responsive user interface
- Backend API integration
- Dashboard documentation

---

# 👥 Contributors

This branch is maintained by the **Step 2 Team**, responsible for monitoring, visualization, alert management, and user interface development.

---

# 🔀 Merge Policy

Once Step 2 is completed:

```
step-2
    │
    ▼
Pull Request
    │
    ▼
develop
    │
    ▼
main
```

Only tested and reviewed code should be merged into the `develop` branch.
