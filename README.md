# 💧 Smart Water Quality System for Water Reuse

> AI-powered platform for monitoring, storing, analyzing, and predicting water quality for water reuse applications.

## 📖 Overview

The **Smart Water Quality System** is a collaborative project developed during the CIRCUA summer internship. The objective is to collect real-time water quality data from IoT sensors, store and process the data, visualize it through an interactive dashboard, and apply Artificial Intelligence models to predict future water quality.

The system combines:

- 🌐 IoT Sensors (ESP32)
- 📡 ThingSpeak / MQTT
- 🗄️ Database Management
- 📊 Interactive Dashboard
- 🤖 AI & LSTM Prediction
- ☁️ Cloud-ready Backend

---

# 🎯 Objectives

- Collect real-time water quality data.
- Store raw sensor measurements.
- Build datasets for scientific studies.
- Monitor water quality through dashboards.
- Generate alerts for abnormal values.
- Predict future water quality using AI models.

---

# 🏗️ Repository Structure

```
Projet-IA-Water-Reuse-CIRCUA/

│
├── backend/
├── frontend/
├── database/
├── ai/
├── docs/
├── datasets/
├── mqtt/
├── docker/
└── README.md
```

---

# 🌿 Git Workflow

The repository follows a collaborative Git workflow.

```
main
│
└── develop
    ├── step-1
    ├── step-2
    ├── step-3
    └── step-4
```

### Branch Description

| Branch | Purpose |
|---------|---------|
| main | Stable production version |
| develop | Integration branch |
| step-1 | Data acquisition & storage |
| step-2 | Monitoring dashboard & alerts |
| step-3 | AI prediction (LSTM) |
| step-4 | Additional project development |

---

# 📋 Project Steps

## ✅ Step 1 — Data Storage & Preprocessing

Responsible for:

- Real-time sensor data collection
- Database design
- Data preprocessing
- Study dataset generation
- ThingSpeak API integration
- MQTT communication (optional)

---

## ✅ Step 2 — Monitoring Dashboard

Responsible for:

- Dashboard development
- Real-time visualization
- Historical data
- Alerts
- Multi-sensor comparison

---

## ✅ Step 3 — AI Prediction

Responsible for:

- Dataset preparation
- LSTM implementation
- Water quality forecasting
- Model evaluation

---

## ✅ Step 4 — System Integration

Responsible for:

- Integration of all modules
- Testing
- Optimization
- Deployment support
- Documentation

---

# 🛠️ Technologies

- Python
- FastAPI / Flask
- PostgreSQL
- MQTT
- ESP32
- ThingSpeak
- Pandas
- TensorFlow / Keras
- LSTM
- Docker
- Git & GitHub

---

# 📊 Sensor Parameters

The system processes:

- pH
- Temperature
- Electrical Conductivity (EC)
- Turbidity
- Dissolved Oxygen (DO)

---

# 🚀 Getting Started

Clone the repository

```bash
git clone https://github.com/<username>/Projet-IA-Water-Reuse-CIRCUA-.git
```

Enter the project

```bash
cd Projet-IA-Water-Reuse-CIRCUA-
```

Switch to the development branch

```bash
git checkout develop
```

---

# 🤝 Collaboration Rules

- Work only on your assigned **step** branch.
- Create Pull Requests into **develop**.
- Do not push directly to **main**.
- Keep commits small and descriptive.
- Review code before merging.

---

# 📄 License

This project is developed for academic and research purposes as part of the CIRCUA Summer Internship.

---

# 👥 Contributors

Developed collaboratively by the CIRCUA internship team.
