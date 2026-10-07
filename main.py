from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import json
from pathlib import Path

import mysql.connector


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="BMKG Maritime API",
    version="1.0"
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# MYSQL
# ============================================================

DB_CONFIG = {

    "host":
        "127.0.0.1",

    "port":
        3306,

    "user":
        "root",

    "password":
        "root",

    "database":
        "airflow_db",

    "connection_timeout":
        5,

}


# ============================================================
# FILE HASIL JUPYTER
# ============================================================

ANALYSIS_FILE = Path(
    r"D:\airflow\analisis_bmkg\data\hasil_dashboard.json"
)


# ============================================================
# HOME
# ============================================================

@app.get("/")
def home():

    return {
        "message":
            "BMKG Maritime API aktif"
    }


# ============================================================
# DATA BMKG
# ============================================================

@app.get("/data")
def get_data():

    conn = None
    cursor = None

    try:

        conn = mysql.connector.connect(
            **DB_CONFIG
        )

        cursor = conn.cursor(
            dictionary=True
        )

        cursor.execute(
            """
            SELECT *
            FROM bmkg_maritim
            ORDER BY waktu_utc DESC
            """
        )

        data = cursor.fetchall()

        return data

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error)
        )

    finally:

        if cursor:

            cursor.close()

        if conn:

            conn.close()


# ============================================================
# HASIL ANALISIS JUPYTER
# ============================================================

@app.get("/analysis")
def get_analysis():

    if not ANALYSIS_FILE.exists():

        raise HTTPException(
            status_code=404,
            detail=(
                "hasil_dashboard.json belum tersedia. "
                "Jalankan cell export di Jupyter."
            )
        )


    try:

        with open(
            ANALYSIS_FILE,
            "r",
            encoding="utf-8"
        ) as file:

            return json.load(file)

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error)
        )