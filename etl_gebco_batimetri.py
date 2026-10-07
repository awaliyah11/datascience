from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import pymysql
import xarray as xr

from airflow import DAG
from airflow.operators.python import PythonOperator


# =====================================================
# 1. KONFIGURASI FILE
# =====================================================

FILE_GEBCO = Path(
    "/usr/local/airflow/include/data/gebco/"
    "gebco_2026_n-3.5_s-5.7_w121.0_e123.5.nc"
)

FILE_CSV = Path(
    "/usr/local/airflow/include/data/gebco/"
    "gebco_lima_pelabuhan.csv"
)


# =====================================================
# 2. KOORDINAT LIMA PELABUHAN
# =====================================================

PELABUHAN = [
    {
        "kode": "AF001",
        "nama": "Pelabuhan Nusantara Kendari",
        "lat": -3.973550,
        "lon": 122.584220,
    },
    {
        "kode": "AF004",
        "nama": "Pelabuhan Kolaka",
        "lat": -4.057490,
        "lon": 121.589600,
    },
    {
        "kode": "AF006",
        "nama": "Pelabuhan Raha",
        "lat": -4.835015,
        "lon": 122.735300,
    },
    {
        "kode": "AF011",
        "nama": "Pelabuhan Kasipute",
        "lat": -4.768330,
        "lon": 122.053960,
    },
    {
        "kode": "AF013",
        "nama": "Pelabuhan Sikeli",
        "lat": -5.269070,
        "lon": 121.808430,
    },
]


# =====================================================
# 3. KONFIGURASI DATABASE MYSQL
# =====================================================

DB_CONFIG = {
    "host": "host.docker.internal",
    "port": 3306,
    "user": "root",
    "password": "root",
    "database": "airflow_db",
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
}


# =====================================================
# 4. MENGHITUNG JARAK DUA KOORDINAT
# =====================================================

def hitung_jarak_km(lat1, lon1, lat2, lon2):
    radius_bumi = 6371

    lat1 = np.radians(lat1)
    lon1 = np.radians(lon1)
    lat2 = np.radians(lat2)
    lon2 = np.radians(lon2)

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        np.sin(dlat / 2) ** 2
        + np.cos(lat1)
        * np.cos(lat2)
        * np.sin(dlon / 2) ** 2
    )

    return 2 * radius_bumi * np.arcsin(
        np.sqrt(np.clip(a, 0, 1))
    )


# =====================================================
# 5. EKSTRAKSI DATA GEBCO
# =====================================================

def ekstrak_dan_simpan_gebco():

    if not FILE_GEBCO.exists():
        raise FileNotFoundError(
            f"File GEBCO tidak ditemukan: {FILE_GEBCO}"
        )

    print("Membaca file GEBCO:", FILE_GEBCO)

    with xr.open_dataset(FILE_GEBCO) as ds:

        # Mencari variabel elevasi dasar laut
        kandidat = [
            nama for nama in ds.data_vars
            if nama.lower() in ("elevation", "bathymetry")
        ]

        if not kandidat:
            raise ValueError(
                "Variabel elevation/bathymetry tidak ditemukan. "
                f"Variabel tersedia: {list(ds.data_vars)}"
            )

        da = ds[kandidat[0]]

        # Mencari nama koordinat lintang dan bujur
        nama_lat = next(
            (n for n in ("lat", "latitude") if n in ds.coords),
            None,
        )
        nama_lon = next(
            (n for n in ("lon", "longitude") if n in ds.coords),
            None,
        )

        if nama_lat is None or nama_lon is None:
            raise ValueError(
                "Koordinat latitude/longitude tidak ditemukan."
            )

        lat = ds[nama_lat].values
        lon = ds[nama_lon].values
        elevasi = np.asarray(da.squeeze().values)

        # Membentuk grid koordinat jika lat/lon berbentuk 1D
        if lat.ndim == 1 and lon.ndim == 1:
            lat_grid, lon_grid = np.meshgrid(
                lat, lon, indexing="ij"
            )

            if elevasi.shape == (len(lon), len(lat)):
                elevasi = elevasi.T

        elif lat.ndim == 2 and lon.ndim == 2:
            lat_grid = lat
            lon_grid = lon

        else:
            raise ValueError(
                "Bentuk koordinat GEBCO tidak didukung."
            )

        if elevasi.shape != lat_grid.shape:
            raise ValueError(
                f"Bentuk data elevasi {elevasi.shape} tidak cocok "
                f"dengan grid {lat_grid.shape}."
            )

        hasil = []

        for p in PELABUHAN:
            lat_target = p["lat"]
            lon_target = p["lon"]

            # Kandidat titik laut dalam radius geografis lokal
            kandidat_grid = (
                (np.abs(lat_grid - lat_target) <= 0.04)
                & (np.abs(lon_grid - lon_target) <= 0.04)
                & np.isfinite(elevasi)
                & (elevasi < 0)
            )

            indeks = np.argwhere(kandidat_grid)

            if len(indeks) == 0:
                raise ValueError(
                    f"Tidak ditemukan titik laut GEBCO untuk "
                    f"{p['kode']}. Periksa cakupan file dan koordinat."
                )

            lat_kandidat = lat_grid[kandidat_grid]
            lon_kandidat = lon_grid[kandidat_grid]
            elev_kandidat = elevasi[kandidat_grid]

            jarak = hitung_jarak_km(
                lat_target,
                lon_target,
                lat_kandidat,
                lon_kandidat,
            )

            # Memilih titik laut terdekat maksimal 3 km
            idx = int(np.argmin(jarak))

            if jarak[idx] > 3:
                raise ValueError(
                    f"Titik laut terdekat untuk {p['kode']} "
                    f"berjarak {jarak[idx]:.2f} km, melebihi 3 km."
                )

            # GEBCO menyimpan elevasi dasar laut sebagai nilai negatif.
            # Kedalaman ditampilkan sebagai nilai positif.
            kedalaman = abs(float(elev_kandidat[idx]))

            hasil.append({
                "kode_pelabuhan": p["kode"],
                "latitude": float(lat_kandidat[idx]),
                "longitude": float(lon_kandidat[idx]),
                "kedalaman_m": round(kedalaman, 3),
                "sumber_data": "GEBCO",
            })

            print(
                f"{p['kode']}: kedalaman {kedalaman:.3f} m, "
                f"jarak titik {jarak[idx]:.2f} km"
            )

    # Simpan hasil ekstraksi ke CSV
    FILE_CSV.parent.mkdir(parents=True, exist_ok=True)

    df = pd.DataFrame(hasil)
    df.to_csv(FILE_CSV, index=False)

    print(f"CSV berhasil disimpan: {FILE_CSV}")

    # =================================================
    # 6. SIMPAN DATA KE MYSQL
    # =================================================

    koneksi = pymysql.connect(**DB_CONFIG)

    try:
        with koneksi.cursor() as cursor:

            sql = """
                INSERT INTO gebco_batimetri
                (
                    kode_pelabuhan,
                    latitude,
                    longitude,
                    kedalaman_m,
                    sumber_data
                )
                VALUES (%s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    kode_pelabuhan = VALUES(kode_pelabuhan),
                    kedalaman_m = VALUES(kedalaman_m),
                    sumber_data = VALUES(sumber_data)
            """

            data = [
                (
                    row["kode_pelabuhan"],
                    row["latitude"],
                    row["longitude"],
                    row["kedalaman_m"],
                    row["sumber_data"],
                )
                for row in hasil
            ]

            cursor.executemany(sql, data)

        koneksi.commit()
        print(f"Berhasil menyimpan {len(hasil)} data GEBCO.")

    finally:
        koneksi.close()


# =====================================================
# 7. DEFINISI DAG AIRFLOW
# =====================================================

with DAG(
    dag_id="etl_gebco_batimetri",
    description="ETL data batimetri GEBCO untuk lima pelabuhan",
    start_date=datetime(2026, 9, 22),
    schedule="0 * * * *",
    catchup=False,
    tags=["ETL", "GEBCO", "Batimetri"],
) as dag:

    ekstrak_simpan = PythonOperator(
        task_id="ekstrak_dan_simpan",
        python_callable=ekstrak_dan_simpan_gebco,
    )

    ekstrak_simpan