
from pathlib import Path

import pandas as pd
import xarray as xr
import pymysql
import pendulum

from airflow.decorators import dag, task


# Lokasi file NetCDF di dalam container Airflow
FILE_ERA5 = Path(
    "/usr/local/airflow/include/data/era5_gelombang.nc"
)

# Database MySQL
MYSQL_CONFIG = {
    "host": "host.docker.internal",
    "port": 3306,
    "user": "root",
    "password": "root",
    "database": "airflow_db",
    "connect_timeout": 10,
}

# Koordinat grid ERA5 yang digunakan sebelumnya
PELABUHAN = [
    ("AF001", -4.0, -4.0, 122.5),
    ("AF004", -4.5, -4.5, 121.5),
    ("AF006", -5.0, -5.0, 123.0),
    ("AF011", -5.0, -5.0, 122.0),
    ("AF013", -5.5, -5.5, 122.0),
]


@dag(
    dag_id="etl_era5_gelombang",
    description="ETL tinggi gelombang signifikan ERA5",
    schedule="0 * * * *",
    start_date=pendulum.datetime(2026, 9, 1, tz="UTC"),
    catchup=False,
    tags=["ETL", "ERA5", "gelombang"],
)
def etl_era5_gelombang():

    @task
    def ekstrak_dan_simpan():
        # 1. Periksa file sumber
        if not FILE_ERA5.exists():
            raise FileNotFoundError(
                f"File ERA5 tidak ditemukan: {FILE_ERA5}"
            )

        hasil = []

        # 2. Baca file NetCDF
        with xr.open_dataset(FILE_ERA5) as ds:
            print("Variabel ERA5:", list(ds.data_vars))
            print("Koordinat ERA5:", list(ds.coords))

            # Cari variabel tinggi gelombang
            var_swh = next(
                (
                    v for v in ds.data_vars
                    if v.lower() in ["swh", "significant_height_of_combined_wind_waves_and_swell"]
                ),
                None,
            )

            if var_swh is None:
                raise ValueError(
                    "Variabel tinggi gelombang ERA5 tidak ditemukan."
                )

            # Cari nama koordinat
            lat_name = next(
                (
                    c for c in ds.coords
                    if c.lower() in ["latitude", "lat"]
                ),
                None,
            )

            lon_name = next(
                (
                    c for c in ds.coords
                    if c.lower() in ["longitude", "lon"]
                ),
                None,
            )

            time_name = next(
                (
                    c for c in ds.coords
                    if c.lower() in ["valid_time", "time"]
                ),
                None,
            )

            if not all([lat_name, lon_name, time_name]):
                raise ValueError(
                    "Koordinat waktu, latitude, atau longitude tidak ditemukan."
                )

            # 3. Ekstrak data untuk setiap pelabuhan
            for kode, lat_target, lat_grid, lon_grid in PELABUHAN:
                titik = ds[var_swh].sel(
                    {
                        lat_name: lat_grid,
                        lon_name: lon_grid,
                    }
                )

                # Pastikan koordinat yang dipilih sesuai grid
                lat_aktual = float(
                    titik[lat_name].values
                )
                lon_aktual = float(
                    titik[lon_name].values
                )

                if (
                    abs(lat_aktual - lat_grid) > 0.001
                    or abs(lon_aktual - lon_grid) > 0.001
                ):
                    raise ValueError(
                        f"Grid ERA5 tidak sesuai untuk {kode}."
                    )

                waktu = titik[time_name].values
                nilai = titik.values

                for t, swh in zip(waktu, nilai):
                    waktu_utc = pd.Timestamp(t).to_pydatetime()

                    hasil.append(
                        (
                            kode,
                            waktu_utc,
                            lat_aktual,
                            lon_aktual,
                            (
                                None
                                if pd.isna(swh)
                                else float(swh)
                            ),
                            "ERA5",
                        )
                    )

        print("Jumlah data hasil ekstraksi:", len(hasil))

        if not hasil:
            raise ValueError("Tidak ada data ERA5 yang berhasil diekstrak.")

        # 4. Simpan data ke MySQL
        koneksi = pymysql.connect(**MYSQL_CONFIG)

        query = """
        INSERT INTO era5_gelombang
        (
            kode_pelabuhan,
            waktu_utc,
            latitude,
            longitude,
            swh_m,
            sumber_data
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            swh_m = VALUES(swh_m),
            sumber_data = VALUES(sumber_data)
        """

        try:
            with koneksi.cursor() as cursor:
                cursor.executemany(query, hasil)

            koneksi.commit()
            print("Data ERA5 berhasil disimpan ke MySQL.")

        finally:
            koneksi.close()

    ekstrak_dan_simpan()


etl_era5_gelombang()