# 🤖 Step 3 — AI Prediction with LSTM

This branch contains the implementation of **Step 3** of the **Smart Water Quality System** project.

The objective of this step is to develop Artificial Intelligence models capable of predicting future water quality parameters using Long Short-Term Memory (LSTM) neural networks.

---

# 🎯 Objectives

- Analyze historical water quality data.
- Prepare datasets for time-series forecasting.
- Develop LSTM models for prediction.
- Forecast future water quality trends.
- Evaluate model performance.
- Provide predictions to the monitoring dashboard.

---

# 📊 Prediction Targets

The AI model predicts the evolution of the following parameters:

| Parameter | Description |
|-----------|-------------|
| pH | Water acidity/basicity |
| Electrical Conductivity (EC) | Mineral concentration |
| Dissolved Oxygen (DO) | Oxygen concentration |

The training dataset is based on **water_quality.csv**.

---

# 🧠 AI Workflow

```
Historical Dataset
        │
        ▼
Data Cleaning
        │
        ▼
Feature Engineering
        │
        ▼
Normalization
        │
        ▼
Sequence Generation
        │
        ▼
LSTM Model Training
        │
        ▼
Model Evaluation
        │
        ▼
Future Predictions
        │
        ▼
Dashboard Integration
```

---

# 📁 Project Structure

```
step-3/

ai/
├── datasets/
├── preprocessing/
├── models/
├── training/
├── evaluation/
├── prediction/
├── notebooks/

backend/
├── api/
├── services/

README.md
```

---

# 📂 Dataset

Example columns:

```
created_at
ph
temperature
ec
turbidity
do
set_number
```

The preprocessing pipeline includes:

- Missing value handling
- Outlier detection
- Feature scaling
- Time indexing
- Sequence creation for LSTM input

---

# 🧠 Machine Learning Pipeline

### 1. Data Preparation

- Load dataset
- Clean missing values
- Normalize features
- Split training/testing data

---

### 2. Sequence Generation

Convert time-series observations into fixed-length sequences suitable for LSTM training.

---

### 3. Model Training

Train an LSTM neural network to learn temporal patterns in water quality data.

---

### 4. Model Evaluation

Evaluate prediction quality using metrics such as:

- MAE (Mean Absolute Error)
- RMSE (Root Mean Squared Error)
- R² Score

---

### 5. Prediction

Generate forecasts for:

- Future pH
- Future EC
- Future DO

Predictions can be exposed through backend APIs for visualization.

---

# 🛠️ Technologies

- Python
- TensorFlow
- Keras
- NumPy
- Pandas
- Scikit-learn
- Matplotlib
- FastAPI / Flask
- Jupyter Notebook

---

# 📈 Expected Outputs

- Trained LSTM model
- Saved model weights
- Prediction API
- Evaluation reports
- Prediction visualizations
- Performance metrics

---

# ▶️ Running the Project

Clone the repository:

```bash
git clone https://github.com/<username>/Projet-IA-Water-Reuse-CIRCUA-.git
```

Switch to the branch:

```bash
git checkout step-3
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Train the model:

```bash
python train.py
```

Run prediction:

```bash
python predict.py
```

---

# 📊 Evaluation Metrics

The trained model should be evaluated using:

| Metric | Purpose |
|---------|----------|
| MAE | Average prediction error |
| RMSE | Penalizes large prediction errors |
| R² Score | Measures goodness of fit |

---

# 🔗 Integration

The prediction service communicates with:

- Step 1 (Processed datasets)
- Step 2 (Monitoring dashboard)
- Backend API

```
Processed Dataset
        │
        ▼
LSTM Model
        │
        ▼
Prediction API
        │
        ▼
Monitoring Dashboard
```

---

# 📌 Deliverables

- Data preprocessing pipeline
- LSTM training scripts
- Trained AI model
- Prediction service
- Model evaluation reports
- API endpoints
- Documentation

---

# 👥 Contributors

This branch is maintained by the **Step 3 Team**, responsible for Artificial Intelligence, time-series forecasting, model training, and prediction services.

---

# 🔀 Merge Policy

Once Step 3 is completed:

```
step-3
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

Only tested and validated AI models should be merged into the `develop` branch.
