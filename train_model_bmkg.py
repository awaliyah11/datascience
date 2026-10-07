from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.hooks.base import BaseHook

from datetime import datetime, timedelta

import pandas as pd
import mysql.connector
import joblib

from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


# ============================================================
# KONFIGURASI
# ============================================================

MODEL_DIR = "/usr/local/airflow/include/model_bmkg"

MODEL_FILE = f"{MODEL_DIR}/random_forest_wave.joblib"
METRICS_FILE = f"{MODEL_DIR}/metrics.json"


FEATURES = [
    "wind_speed",
    "wind_gust",
    "temp_avg",
    "rh_avg",
    "visibility",
    "current_speed",
    "kedalaman_gebco_m",
]

TARGET = "gelombang_bmkg"


# ============================================================
# DEFAULT ARGUMENTS
# ============================================================

default_args = {
    "owner": "airflow",
    "retries": 1,
    "retry_delay": timedelta(minutes=2),
}


# ============================================================
# TASK TRAINING MODEL
# ============================================================

def train_model():

    print("==========================================")
    print("TRAINING MODEL BMKG")
    print("==========================================")

    # --------------------------------------------------------
    # 1. Ambil koneksi MySQL
    # --------------------------------------------------------

    connection = BaseHook.get_connection(
        "mysql-local"
    )

    conn = mysql.connector.connect(
        host=connection.host,
        port=connection.port,
        user=connection.login,
        password=connection.password,
        database=connection.schema,
    )

    # --------------------------------------------------------
    # 2. Ambil dataset gabungan
    # --------------------------------------------------------

    query = """
        SELECT
            b.kode_pelabuhan,
            b.nama_pelabuhan,
            b.waktu_utc,

            b.wind_speed,
            b.wind_gust,
            b.temp_avg,
            b.rh_avg,
            b.visibility,
            b.current_speed,

            b.wave_height AS gelombang_bmkg,

            g.kedalaman_m AS kedalaman_gebco_m

        FROM bmkg_maritim AS b

        LEFT JOIN gebco_batimetri AS g
            ON b.kode_pelabuhan = g.kode_pelabuhan

        ORDER BY
            b.waktu_utc
    """

    df = pd.read_sql(query, conn)

    conn.close()

    print("Jumlah data:", len(df))
    print("Kolom:", df.columns.tolist())


    # --------------------------------------------------------
    # 3. Bersihkan data
    # --------------------------------------------------------

    df["waktu_utc"] = pd.to_datetime(
        df["waktu_utc"],
        errors="coerce"
    )

    df = df.dropna(
        subset=[
            "waktu_utc",
            TARGET
        ]
    )

    print("Data setelah cleaning:", len(df))


    # --------------------------------------------------------
    # 4. Pisahkan tanggal
    # --------------------------------------------------------

    df["tanggal"] = df["waktu_utc"].dt.date

    tanggal_tersedia = sorted(
        df["tanggal"].dropna().unique()
    )

    print("Jumlah tanggal:", len(tanggal_tersedia))

    if len(tanggal_tersedia) < 2:

        raise ValueError(
            "Data belum cukup untuk melakukan train-test split berdasarkan tanggal."
        )


    # --------------------------------------------------------
    # 5. Gunakan tanggal terakhir sebagai data testing
    # --------------------------------------------------------

    tanggal_test = tanggal_tersedia[-1]

    train_df = df[
        df["tanggal"] < tanggal_test
    ].copy()

    test_df = df[
        df["tanggal"] == tanggal_test
    ].copy()

    print("Tanggal testing:", tanggal_test)

    print("Jumlah data training:", len(train_df))
    print("Jumlah data testing:", len(test_df))


    # --------------------------------------------------------
    # 6. X dan y
    # --------------------------------------------------------

    X_train = train_df[FEATURES]
    y_train = train_df[TARGET]

    X_test = test_df[FEATURES]
    y_test = test_df[TARGET]


    # --------------------------------------------------------
    # 7. Pipeline preprocessing + Random Forest
    # --------------------------------------------------------

    model = Pipeline(
        steps=[
            (
                "imputer",
                SimpleImputer(
                    strategy="median"
                )
            ),
            (
                "random_forest",
                RandomForestRegressor(
                    n_estimators=200,
                    random_state=42,
                    n_jobs=-1
                )
            )
        ]
    )


    # --------------------------------------------------------
    # 8. Training
    # --------------------------------------------------------

    print("Mulai training Random Forest...")

    model.fit(
        X_train,
        y_train
    )

    print("Training selesai.")


    # --------------------------------------------------------
    # 9. Prediksi
    # --------------------------------------------------------

    y_pred = model.predict(
        X_test
    )


    # --------------------------------------------------------
    # 10. Evaluasi
    # --------------------------------------------------------

    mae = mean_absolute_error(
        y_test,
        y_pred
    )

    rmse = mean_squared_error(
        y_test,
        y_pred
    ) ** 0.5

    r2 = r2_score(
        y_test,
        y_pred
    )


    print()
    print("==========================================")
    print("HASIL EVALUASI")
    print("==========================================")

    print(f"MAE  : {mae:.4f}")
    print(f"RMSE : {rmse:.4f}")
    print(f"R2   : {r2:.4f}")


    # --------------------------------------------------------
    # 11. Buat folder model
    # --------------------------------------------------------

    import os

    os.makedirs(
        MODEL_DIR,
        exist_ok=True
    )


    # --------------------------------------------------------
    # 12. Simpan model
    # --------------------------------------------------------

    joblib.dump(
        model,
        MODEL_FILE
    )

    print()
    print("Model disimpan di:")
    print(MODEL_FILE)


    # --------------------------------------------------------
    # 13. Simpan metrics
    # --------------------------------------------------------

    metrics = {
        "model": "Random Forest Regressor",
        "tanggal_training": datetime.utcnow().isoformat(),
        "tanggal_testing": str(tanggal_test),
        "jumlah_data_training": len(train_df),
        "jumlah_data_testing": len(test_df),
        "MAE": float(mae),
        "RMSE": float(rmse),
        "R2": float(r2),
        "features": FEATURES
    }

    import json

    with open(
        METRICS_FILE,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            metrics,
            file,
            indent=2
        )


    print("Metrics disimpan di:")
    print(METRICS_FILE)

    print()
    print("==========================================")
    print("TRAINING SELESAI")
    print("==========================================")


# ============================================================
# DAG
# ============================================================

with DAG(
    dag_id="train_model_bmkg",
    default_args=default_args,
    description="Retraining model Random Forest prediksi tinggi gelombang BMKG",
    start_date=datetime(2026, 10, 6),
    schedule="0 3 * * 1",
    catchup=False,
    tags=["BMKG", "ML", "Training"],
) as dag:

    train_task = PythonOperator(
        task_id="train_random_forest",
        python_callable=train_model,
    )