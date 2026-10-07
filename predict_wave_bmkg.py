from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.hooks.base import BaseHook

from datetime import datetime, timedelta

import pandas as pd
import mysql.connector
import joblib


# ============================================================
# KONFIGURASI
# ============================================================

MODEL_FILE = (
    "/usr/local/airflow/include/"
    "model_bmkg/random_forest_wave.joblib"
)

FEATURES = [
    "wind_speed",
    "wind_gust",
    "temp_avg",
    "rh_avg",
    "visibility",
    "current_speed",
    "kedalaman_gebco_m",
]


# ============================================================
# DEFAULT ARGUMENTS
# ============================================================

default_args = {
    "owner": "airflow",
    "retries": 1,
    "retry_delay": timedelta(minutes=2),
}


# ============================================================
# TASK PREDIKSI
# ============================================================

def predict_wave():

    print("==========================================")
    print("PREDIKSI TINGGI GELOMBANG")
    print("==========================================")


    # --------------------------------------------------------
    # 1. Cek model
    # --------------------------------------------------------

    import os

    if not os.path.exists(MODEL_FILE):
        raise FileNotFoundError(
            f"Model tidak ditemukan: {MODEL_FILE}"
        )

    print("Model ditemukan:")
    print(MODEL_FILE)


    # --------------------------------------------------------
    # 2. Load model
    # --------------------------------------------------------

    model = joblib.load(
        MODEL_FILE
    )

    print("Model berhasil dimuat.")


    # --------------------------------------------------------
    # 3. Koneksi MySQL
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
    # 4. Ambil data BMKG + GEBCO
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

            b.wave_height AS gelombang_aktual,

            g.kedalaman_m AS kedalaman_gebco_m

        FROM bmkg_maritim AS b

        LEFT JOIN gebco_batimetri AS g
            ON b.kode_pelabuhan = g.kode_pelabuhan

        ORDER BY
            b.waktu_utc DESC
    """

    df = pd.read_sql(
        query,
        conn
    )

    print(
        f"Jumlah data yang dibaca: {len(df)}"
    )


    # --------------------------------------------------------
    # 5. Pastikan data tersedia
    # --------------------------------------------------------

    if df.empty:
        conn.close()

        raise ValueError(
            "Tidak ada data BMKG untuk diprediksi."
        )


    # --------------------------------------------------------
    # 6. Ambil fitur
    # --------------------------------------------------------

    X = df[FEATURES]


    # --------------------------------------------------------
    # 7. Prediksi
    # --------------------------------------------------------

    df["prediksi_gelombang"] = model.predict(
        X
    )


    # --------------------------------------------------------
    # 8. Batasi prediksi minimum 0
    # --------------------------------------------------------

    df["prediksi_gelombang"] = (
        df["prediksi_gelombang"]
        .clip(lower=0)
    )


    # --------------------------------------------------------
    # 9. Waktu prediksi
    # --------------------------------------------------------

    waktu_prediksi = datetime.utcnow()


    # --------------------------------------------------------
    # 10. Simpan hasil ke MySQL
    # --------------------------------------------------------

    cursor = conn.cursor()

    sql = """
        INSERT INTO prediksi_gelombang (
            kode_pelabuhan,
            nama_pelabuhan,
            waktu_utc,
            gelombang_aktual,
            prediksi_gelombang,
            model,
            waktu_prediksi
        )
        VALUES (
            %s, %s, %s, %s, %s, %s, %s
        )

        ON DUPLICATE KEY UPDATE

            gelombang_aktual =
                VALUES(gelombang_aktual),

            prediksi_gelombang =
                VALUES(prediksi_gelombang),

            model =
                VALUES(model),

            waktu_prediksi =
                VALUES(waktu_prediksi)
    """


    data_to_insert = []

    for _, row in df.iterrows():

        data_to_insert.append(
            (
                row["kode_pelabuhan"],
                row["nama_pelabuhan"],
                row["waktu_utc"],
                row["gelombang_aktual"],
                row["prediksi_gelombang"],
                "Random Forest",
                waktu_prediksi,
            )
        )


    cursor.executemany(
        sql,
        data_to_insert
    )

    conn.commit()


    print(
        f"Berhasil menyimpan "
        f"{len(data_to_insert)} prediksi."
    )


    cursor.close()
    conn.close()


    print("==========================================")
    print("PREDIKSI SELESAI")
    print("==========================================")


# ============================================================
# DAG
# ============================================================

with DAG(
    dag_id="predict_wave_bmkg",

    default_args=default_args,

    description=(
        "Prediksi otomatis tinggi gelombang "
        "menggunakan Random Forest"
    ),

    start_date=datetime(
        2026,
        10,
        6
    ),

    schedule="10 * * * *",

    catchup=False,

    tags=[
        "BMKG",
        "ML",
        "Prediction"
    ],

) as dag:


    predict_task = PythonOperator(
        task_id="predict_wave_height",

        python_callable=predict_wave,
    )