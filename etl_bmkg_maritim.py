from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.common.sql.operators.sql import SQLExecuteQueryOperator
from airflow.hooks.base import BaseHook

from datetime import datetime, timedelta
import requests
import pandas as pd
import json
import os
import mysql.connector


# ============================================================
# KONFIGURASI
# ============================================================

API_BASE_URL = (
    "https://maritim.bmkg.go.id/"
    "marine2026-data/pelabuhan/"
)

PELABUHAN = {
    "AF001": "Pelabuhan Nusantara Kendari",
    "AF004": "Pelabuhan Kolaka",
    "AF006": "Pelabuhan Raha",
    "AF011": "Pelabuhan Kasipute",
    "AF013": "Pelabuhan Sikeli",
}

RAW_FILE = "/usr/local/airflow/include/bmkg_raw.json"
TRANSFORMED_FILE = "/usr/local/airflow/include/bmkg_transformed.csv"


# ============================================================
# DEFAULT ARGUMENTS
# ============================================================

default_args = {
    "owner": "airflow",
    "retries": 1,
    "retry_delay": timedelta(minutes=2),
}


# ============================================================
# TASK 1: EXTRACT DATA DARI BMKG API
# ============================================================

def extract_from_api():

    semua_data = []

    for kode, nama_pelabuhan in PELABUHAN.items():

        url = f"{API_BASE_URL}{kode}.json"

        print(f"Mengambil data dari: {url}")

        response = requests.get(url, timeout=30)

        # Jika API gagal, task akan dianggap gagal
        response.raise_for_status()

        data = response.json()

        # Pastikan forecast_day1 tersedia
        
        # Ambil kedua bagian prakiraan sesuai struktur API BMKG
        for nama_bagian in ["forecast_day1", "forecast_day2-4"]:
            daftar = data.get(nama_bagian, [])

            print(
                f"{kode} - {nama_bagian}: "
                f"{len(daftar)} data"
            )

            for item in daftar:
                record = {
                    "kode_pelabuhan": kode,
                    "nama_pelabuhan": nama_pelabuhan,
                    "time": item.get("time"),
                    "weather": item.get("weather"),
                    "visibility": item.get("visibility"),
                    "temp_avg": item.get("temp_avg"),
                    "rh_avg": item.get("rh_avg"),
                    "wind_from": item.get("wind_from"),
                    "wind_speed": item.get("wind_speed"),
                    "wind_gust": item.get("wind_gust"),
                    "wave_cat": item.get("wave_cat"),
                    "wave_height": item.get("wave_height"),
                    "current_to": item.get("current_to"),
                    "current_speed": item.get("current_speed"),
                    "tides": item.get("tides"),
                }

                semua_data.append(record)

    # Simpan hasil Extract dalam JSON
    with open(RAW_FILE, "w", encoding="utf-8") as file:
        json.dump(
            semua_data,
            file,
            ensure_ascii=False,
            indent=2
        )

    print(f"Total data hasil Extract: {len(semua_data)}")
    print(f"Data raw disimpan di: {RAW_FILE}")


# ============================================================
# TASK 2: TRANSFORM + PREPROCESSING
# ============================================================

def transform_preprocessing():

    # Membaca data hasil Extract
    df = pd.read_json(RAW_FILE)

    print("Jumlah data sebelum preprocessing:", len(df))

    # --------------------------------------------------------
    # 1. Ubah nama kolom time menjadi waktu_utc
    # --------------------------------------------------------

    df.rename(
        columns={
            "time": "waktu_utc"
        },
        inplace=True
    )

    # --------------------------------------------------------
    # 2. Konversi waktu menjadi datetime
    # --------------------------------------------------------

    df["waktu_utc"] = pd.to_datetime(
        df["waktu_utc"],
        utc=True,
        errors="coerce"
    )

    # --------------------------------------------------------
    # 3. Kolom numerik
    # --------------------------------------------------------

    kolom_numerik = [
        "visibility",
        "temp_avg",
        "rh_avg",
        "wind_speed",
        "wind_gust",
        "wave_height",
        "current_speed",
        "tides",
    ]

    for kolom in kolom_numerik:

        df[kolom] = pd.to_numeric(
            df[kolom],
            errors="coerce"
        )

    # --------------------------------------------------------
    # 4. Missing value numerik
    #    Diisi menggunakan median kolom
    # --------------------------------------------------------

    for kolom in kolom_numerik:

        median_value = df[kolom].median()

        df[kolom] = df[kolom].fillna(
            median_value
        )

    # --------------------------------------------------------
    # 5. Missing value kategori
    # --------------------------------------------------------

    kolom_kategori = [
        "weather",
        "wind_from",
        "wave_cat",
        "current_to",
    ]

    for kolom in kolom_kategori:

        df[kolom] = df[kolom].fillna(
            "Tidak Diketahui"
        )

    # --------------------------------------------------------
    # 6. Validasi kelembapan
    #    RH seharusnya 0 - 100
    # --------------------------------------------------------

    df.loc[
        (df["rh_avg"] < 0) |
        (df["rh_avg"] > 100),
        "rh_avg"
    ] = df["rh_avg"].median()

    # --------------------------------------------------------
    # 7. Hapus data yang tidak memiliki waktu
    # --------------------------------------------------------

    df = df.dropna(
        subset=["waktu_utc"]
    )

    # --------------------------------------------------------
    # 8. Hapus data duplikat
    # --------------------------------------------------------

    df = df.drop_duplicates(
        subset=[
            "kode_pelabuhan",
            "waktu_utc"
        ]
    )

    # --------------------------------------------------------
    # 9. Urutkan data
    # --------------------------------------------------------

    df = df.sort_values(
        by=[
            "kode_pelabuhan",
            "waktu_utc"
        ]
    )

    # --------------------------------------------------------
    # 10. Ubah timezone-aware datetime
    #     menjadi format MySQL
    # --------------------------------------------------------

    df["waktu_utc"] = (
        df["waktu_utc"]
        .dt.strftime("%Y-%m-%d %H:%M:%S")
    )

    # --------------------------------------------------------
    # 11. Simpan dataset hasil Transform
    # --------------------------------------------------------

    df.to_csv(
        TRANSFORMED_FILE,
        index=False
    )

    print("Jumlah data setelah preprocessing:", len(df))
    print("Kolom dataset:")
    print(df.columns.tolist())

    print(
        f"Dataset hasil Transform disimpan di: "
        f"{TRANSFORMED_FILE}"
    )

    print("\nContoh data:")
    print(df.head())


# ============================================================
# TASK 3: LOAD DATA KE MYSQL
# ============================================================

def load_to_mysql():

    # Membaca dataset hasil Transform
    df = pd.read_csv(
        TRANSFORMED_FILE
    )

    # Mengambil konfigurasi koneksi Airflow
    connection = BaseHook.get_connection(
        "mysql-local"
    )

    # Membuka koneksi ke MySQL
    conn = mysql.connector.connect(
        host=connection.host,
        port=connection.port,
        user=connection.login,
        password=connection.password,
        database=connection.schema,
    )

    cursor = conn.cursor()

    # SQL INSERT
    sql = """
        INSERT INTO bmkg_maritim (
            kode_pelabuhan,
            nama_pelabuhan,
            waktu_utc,
            weather,
            visibility,
            temp_avg,
            rh_avg,
            wind_from,
            wind_speed,
            wind_gust,
            wave_cat,
            wave_height,
            current_to,
            current_speed,
            tides
        )
        VALUES (
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s
        )
        ON DUPLICATE KEY UPDATE
            nama_pelabuhan = VALUES(nama_pelabuhan),
            weather = VALUES(weather),
            visibility = VALUES(visibility),
            temp_avg = VALUES(temp_avg),
            rh_avg = VALUES(rh_avg),
            wind_from = VALUES(wind_from),
            wind_speed = VALUES(wind_speed),
            wind_gust = VALUES(wind_gust),
            wave_cat = VALUES(wave_cat),
            wave_height = VALUES(wave_height),
            current_to = VALUES(current_to),
            current_speed = VALUES(current_speed),
            tides = VALUES(tides)
    """

    # Ubah DataFrame menjadi list tuple
    data_to_insert = []

    for _, row in df.iterrows():

        data_to_insert.append(
            (
                row["kode_pelabuhan"],
                row["nama_pelabuhan"],
                row["waktu_utc"],
                row["weather"],
                row["visibility"],
                row["temp_avg"],
                row["rh_avg"],
                row["wind_from"],
                row["wind_speed"],
                row["wind_gust"],
                row["wave_cat"],
                row["wave_height"],
                row["current_to"],
                row["current_speed"],
                row["tides"],
            )
        )

    # Masukkan data ke MySQL
    cursor.executemany(
        sql,
        data_to_insert
    )

    conn.commit()

    print(
        f"Berhasil melakukan LOAD "
        f"{len(data_to_insert)} baris ke MySQL."
    )

    cursor.close()
    conn.close()


# ============================================================
# DAG
# ============================================================

with DAG(
    dag_id="etl_bmkg_maritim",
    default_args=default_args,
    description=(
        "ETL data prakiraan cuaca maritim "
        "5 pelabuhan Sulawesi Tenggara dari BMKG API"
    ),
    start_date=datetime(2026, 9, 22),
    schedule="0 * * * *",
    catchup=False,
    tags=["BMKG", "ETL", "Maritim"],
) as dag:

    # --------------------------------------------------------
    # TASK 1: Membuat tabel MySQL
    # --------------------------------------------------------

    create_table = SQLExecuteQueryOperator(
        task_id="create_table",
        conn_id="mysql-local",
        sql="""
            CREATE TABLE IF NOT EXISTS bmkg_maritim (
                id INT AUTO_INCREMENT PRIMARY KEY,

                kode_pelabuhan VARCHAR(10) NOT NULL,

                nama_pelabuhan VARCHAR(100) NOT NULL,

                waktu_utc DATETIME NOT NULL,

                weather VARCHAR(100),

                visibility FLOAT,

                temp_avg FLOAT,

                rh_avg FLOAT,

                wind_from VARCHAR(50),

                wind_speed FLOAT,

                wind_gust FLOAT,

                wave_cat VARCHAR(50),

                wave_height FLOAT,

                current_to VARCHAR(50),

                current_speed FLOAT,

                tides FLOAT,

                UNIQUE KEY unique_forecast (
                    kode_pelabuhan,
                    waktu_utc
                )
            );
        """,
    )

    # --------------------------------------------------------
    # TASK 2: Extract
    # --------------------------------------------------------

    extract_task = PythonOperator(
        task_id="extract_from_api",
        python_callable=extract_from_api,
    )

    # --------------------------------------------------------
    # TASK 3: Transform + Preprocessing
    # --------------------------------------------------------

    transform_task = PythonOperator(
        task_id="transform_preprocessing",
        python_callable=transform_preprocessing,
    )

    # --------------------------------------------------------
    # TASK 4: Load
    # --------------------------------------------------------

    load_task = PythonOperator(
        task_id="load_to_mysql",
        python_callable=load_to_mysql,
    )

    # --------------------------------------------------------
    # URUTAN ETL
    # --------------------------------------------------------

    create_table >> extract_task >> transform_task >> load_task
    
    
    
    
    
    
    
    
    
    
    
    
    