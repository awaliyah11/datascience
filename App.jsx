import { useEffect, useMemo, useState } from "react";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

import "./App.css";


function App() {

  // ============================================================
  // STATE
  // ============================================================

  const [data, setData] = useState([]);
  const [analysis, setAnalysis] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [pelabuhanDipilih, setPelabuhanDipilih] =
    useState("Semua Pelabuhan");

  const [tanggalDipilih, setTanggalDipilih] =
    useState("Semua Tanggal");

  const [waktuRefresh, setWaktuRefresh] =
    useState(null);


  // ============================================================
  // HASIL ANALISIS
  // ============================================================

  const hasilModel =
    analysis?.model || [];

  const era5Summary =
    analysis?.era5 || {
      matched: 0,
      bias: 0,
      mae: 0,
      rmse: 0,
      pearson: 0,
    };

  const era5PerPelabuhan =
    analysis?.era5?.per_pelabuhan || [];


  // ============================================================
  // FORMAT ANGKA
  // ============================================================

  const formatAngka =
    (nilai, digit = 2) => {

      if (
        nilai === null ||
        nilai === undefined ||
        nilai === "" ||
        Number.isNaN(Number(nilai))
      ) {

        return "-";

      }

      return Number(nilai).toFixed(digit);

    };


  // ============================================================
  // FORMAT WAKTU
  // ============================================================

  const formatWaktuUTC =
    (waktu) => {

      if (!waktu) {
        return "-";
      }

      const tanggal =
        new Date(
          waktu.replace(
            " ",
            "T"
          ) + "Z"
        );

      if (
        Number.isNaN(
          tanggal.getTime()
        )
      ) {

        return waktu;

      }

      return tanggal.toLocaleString(
        "id-ID",
        {
          timeZone:
            "UTC",

          day:
            "2-digit",

          month:
            "short",

          year:
            "numeric",

          hour:
            "2-digit",

          minute:
            "2-digit",
        }
      ) + " UTC";

    };


  // ============================================================
  // FORMAT TANGGAL
  // ============================================================

  const formatTanggal =
    (waktu) => {

      if (!waktu) {
        return "";
      }

      return waktu.split(" ")[0];

    };


  // ============================================================
  // NAMA SINGKAT PELABUHAN
  // ============================================================

  const namaSingkat =
    (nama) => {

      if (!nama) {
        return "-";
      }

      return nama.replace(
        "Pelabuhan ",
        ""
      );

    };


  // ============================================================
  // AMBIL DATA
  // ============================================================

  const ambilData = async () => {

    setLoading(true);
    setError("");

    try {

      // --------------------------------------------------------
      // DATA BMKG
      // --------------------------------------------------------

      const responseData =
        await fetch(
          "http://127.0.0.1:8000/data"
        );

      if (!responseData.ok) {

        throw new Error(
          "Data BMKG gagal diambil dari FastAPI."
        );

      }

      const hasilData =
        await responseData.json();


      if (
        !Array.isArray(
          hasilData
        )
      ) {

        throw new Error(
          "Format data BMKG tidak sesuai. Endpoint /data harus mengembalikan array."
        );

      }


      setData(
        hasilData
      );


      // --------------------------------------------------------
      // HASIL ANALISIS
      // --------------------------------------------------------

      try {

        const responseAnalysis =
          await fetch(
            "http://127.0.0.1:8000/analysis"
          );

        if (
          responseAnalysis.ok
        ) {

          const hasilAnalysis =
            await responseAnalysis.json();

          setAnalysis(
            hasilAnalysis
          );

        } else {

          setAnalysis(
            null
          );

          console.warn(
            "Hasil analisis belum tersedia."
          );

        }

      } catch (
        analysisError
      ) {

        console.warn(
          "Endpoint /analysis tidak dapat diakses:",
          analysisError
        );

        setAnalysis(
          null
        );

      }


      setWaktuRefresh(
        new Date()
      );

    } catch (
      err
    ) {

      console.error(
        err
      );

      setError(
        err.message
      );

    } finally {

      setLoading(
        false
      );

    }

  };


  // ============================================================
  // LOAD PERTAMA + AUTO REFRESH 5 MENIT
  // ============================================================

  useEffect(() => {

    ambilData();

    const interval =
      setInterval(
        ambilData,
        5 * 60 * 1000
      );

    return () => {

      clearInterval(
        interval
      );

    };

  }, []);


  // ============================================================
  // DAFTAR PELABUHAN
  // ============================================================

  const daftarPelabuhan =
    useMemo(
      () => {

        return [
          ...new Set(
            data
              .map(
                (item) =>
                  item.nama_pelabuhan
              )
              .filter(Boolean)
          ),
        ];

      },
      [data]
    );


  // ============================================================
  // DAFTAR TANGGAL
  // ============================================================

  const daftarTanggal =
    useMemo(
      () => {

        return [
          ...new Set(
            data
              .map(
                (item) =>
                  formatTanggal(
                    item.waktu_utc
                  )
              )
              .filter(Boolean)
          ),
        ].sort();

      },
      [data]
    );


  // ============================================================
  // DATA FILTER
  // ============================================================

  const dataFilter =
    useMemo(
      () => {

        return data.filter(
          (item) => {

            const cocokPelabuhan =
              pelabuhanDipilih ===
                "Semua Pelabuhan" ||
              item.nama_pelabuhan ===
                pelabuhanDipilih;


            const cocokTanggal =
              tanggalDipilih ===
                "Semua Tanggal" ||
              formatTanggal(
                item.waktu_utc
              ) ===
                tanggalDipilih;


            return (
              cocokPelabuhan &&
              cocokTanggal
            );

          }
        );

      },
      [
        data,
        pelabuhanDipilih,
        tanggalDipilih,
      ]
    );


  // ============================================================
  // DATA TERBARU
  // ============================================================

  const urutTerbaru =
    useMemo(
      () => {

        return [
          ...dataFilter
        ].sort(
          (a, b) =>
            new Date(
              b.waktu_utc.replace(
                " ",
                "T"
              ) + "Z"
            ) -
            new Date(
              a.waktu_utc.replace(
                " ",
                "T"
              ) + "Z"
            )
        );

      },
      [dataFilter]
    );


  const dataTerbaru =
    urutTerbaru.length > 0
      ? urutTerbaru[0]
      : null;


  // ============================================================
  // KPI
  // ============================================================

  const totalData =
    dataFilter.length;


  const jumlahPelabuhan =
    new Set(
      dataFilter.map(
        (item) =>
          item.nama_pelabuhan
      )
    ).size;


  const rataRataGelombang =
    totalData > 0

      ? dataFilter.reduce(
          (total, item) =>
            total +
            Number(
              item.wave_height ?? 0
            ),
          0
        ) /
        totalData

      : 0;


  const gelombangMaksimum =
    totalData > 0

      ? Math.max(
          ...dataFilter.map(
            (item) =>
              Number(
                item.wave_height ?? 0
              )
          )
        )

      : 0;


  // ============================================================
  // KPI CUACA
  // ============================================================

  const rataRataAngin =
    totalData > 0

      ? dataFilter.reduce(
          (total, item) =>
            total +
            Number(
              item.wind_speed ?? 0
            ),
          0
        ) /
        totalData

      : 0;


  const rataRataSuhu =
    totalData > 0

      ? dataFilter.reduce(
          (total, item) =>
            total +
            Number(
              item.temp_avg ?? 0
            ),
          0
        ) /
        totalData

      : 0;


  // ============================================================
  // Q1 - TREND GELOMBANG
  // ============================================================

  const dataTrendGelombang =
    useMemo(
      () => {

        const waktuMap = {};


        dataFilter.forEach(
          (item) => {

            const waktu =
              item.waktu_utc;


            if (
              !waktuMap[waktu]
            ) {

              waktuMap[waktu] = {
                waktu:
                  waktu,
              };

            }


            const pelabuhan =
              namaSingkat(
                item.nama_pelabuhan
              );


            waktuMap[waktu][
              pelabuhan
            ] =
              Number(
                item.wave_height ?? 0
              );

          }
        );


        return Object.values(
          waktuMap
        ).sort(
          (a, b) =>
            new Date(
              a.waktu.replace(
                " ",
                "T"
              ) + "Z"
            ) -
            new Date(
              b.waktu.replace(
                " ",
                "T"
              ) + "Z"
            )
        );

      },
      [dataFilter]
    );


  // ============================================================
  // FUNGSI TREND CUACA
  // ============================================================

  const buatDataTrend =
    (field) => {

      const waktuMap = {};


      dataFilter.forEach(
        (item) => {

          const waktu =
            item.waktu_utc;


          if (
            !waktuMap[waktu]
          ) {

            waktuMap[waktu] = {
              waktu:
                waktu,
            };

          }


          const pelabuhan =
            namaSingkat(
              item.nama_pelabuhan
            );


          waktuMap[waktu][
            pelabuhan
          ] =
            Number(
              item[field] ?? 0
            );

        }
      );


      return Object.values(
        waktuMap
      ).sort(
        (a, b) =>
          new Date(
            a.waktu.replace(
              " ",
              "T"
            ) + "Z"
          ) -
          new Date(
            b.waktu.replace(
              " ",
              "T"
            ) + "Z"
          )
      );

    };


  const dataTrendAngin =
    useMemo(
      () =>
        buatDataTrend(
          "wind_speed"
        ),
      [dataFilter]
    );


  const dataTrendSuhu =
    useMemo(
      () =>
        buatDataTrend(
          "temp_avg"
        ),
      [dataFilter]
    );


  const dataTrendKelembapan =
    useMemo(
      () =>
        buatDataTrend(
          "rh_avg"
        ),
      [dataFilter]
    );


  // ============================================================
  // WARNA PELABUHAN
  // ============================================================

  const warnaPelabuhan = {

    "Nusantara Kendari":
      "#2b8c88",

    "Kolaka":
      "#4f78b7",

    "Raha":
      "#d8894a",

    "Kasipute":
      "#8b68ad",

    "Sikeli":
      "#c45d75",

  };


  // ============================================================
  // TOOLTIP LABEL
  // ============================================================

  const tooltipWaktu =
    (value) =>
      formatWaktuUTC(
        value
      );


  // ============================================================
  // Q3 - DATA KEDALAMAN GEBCO
  // ============================================================

  const kedalamanMap =
    useMemo(
      () => {

        const map = {};


        (
          analysis?.gebco || []
        ).forEach(
          (item) => {

            map[
              item.nama_pelabuhan
            ] =
              Number(
                item.kedalaman_gebco_m ?? 0
              );

          }
        );


        return map;

      },
      [analysis]
    );


  // ============================================================
  // Q3 - RINGKASAN PELABUHAN
  // ============================================================

  const ringkasanPelabuhan =
    useMemo(
      () => {

        return daftarPelabuhan
          .filter(
            (namaPelabuhan) => {

              if (
                pelabuhanDipilih ===
                "Semua Pelabuhan"
              ) {

                return true;

              }

              return (
                namaPelabuhan ===
                pelabuhanDipilih
              );

            }
          )
          .map(
            (namaPelabuhan) => {

              const dataPelabuhan =
                dataFilter.filter(
                  (item) =>
                    item.nama_pelabuhan ===
                    namaPelabuhan
                );


              const rata =
                (field) => {

                  if (
                    dataPelabuhan.length ===
                    0
                  ) {

                    return 0;

                  }


                  return (
                    dataPelabuhan.reduce(
                      (total, item) =>
                        total +
                        Number(
                          item[field] ?? 0
                        ),
                      0
                    ) /
                    dataPelabuhan.length
                  );

                };


              const gelombang =
                dataPelabuhan.map(
                  (item) =>
                    Number(
                      item.wave_height ?? 0
                    )
                );


              return {

                kode:
                  dataPelabuhan[0]
                    ?.kode_pelabuhan ||
                  "-",

                pelabuhan:
                  namaSingkat(
                    namaPelabuhan
                  ),

                jumlah:
                  dataPelabuhan.length,

                rataGelombang:
                  rata(
                    "wave_height"
                  ),

                rataAngin:
                  rata(
                    "wind_speed"
                  ),

                rataArus:
                  rata(
                    "current_speed"
                  ),

                maksimumGelombang:
                  gelombang.length > 0
                    ? Math.max(
                        ...gelombang
                      )
                    : 0,

                kedalaman:
                  kedalamanMap[
                    namaPelabuhan
                  ] ?? 0,

              };

            }
          );

      },
      [
        daftarPelabuhan,
        dataFilter,
        pelabuhanDipilih,
        kedalamanMap,
      ]
    );


  // ============================================================
  // DATA BAR HORIZONTAL
  // ============================================================

  const dataBarGelombang =
    ringkasanPelabuhan.map(
      (item) => ({

        pelabuhan:
          item.pelabuhan,

        nilai:
          Number(
            item.rataGelombang.toFixed(
              3
            )
          ),

      })
    );


  const dataBarAngin =
    ringkasanPelabuhan.map(
      (item) => ({

        pelabuhan:
          item.pelabuhan,

        nilai:
          Number(
            item.rataAngin.toFixed(
              3
            )
          ),

      })
    );


  const dataBarArus =
    ringkasanPelabuhan.map(
      (item) => ({

        pelabuhan:
          item.pelabuhan,

        nilai:
          Number(
            item.rataArus.toFixed(
              3
            )
          ),

      })
    );


  const dataBarKedalaman =
    ringkasanPelabuhan.map(
      (item) => ({

        pelabuhan:
          item.pelabuhan,

        nilai:
          Number(
            item.kedalaman.toFixed(
              2
            )
          ),

      })
    );


  // ============================================================
  // INSIGHT
  // ============================================================

  const pelabuhanGelombangTertinggi =
    ringkasanPelabuhan.length > 0

      ? [
          ...ringkasanPelabuhan
        ].sort(
          (a, b) =>
            b.rataGelombang -
            a.rataGelombang
        )[0]

      : null;


  const pelabuhanAnginTertinggi =
    ringkasanPelabuhan.length > 0

      ? [
          ...ringkasanPelabuhan
        ].sort(
          (a, b) =>
            b.rataAngin -
            a.rataAngin
        )[0]

      : null;


  // ============================================================
  // SCATTER
  // ============================================================

  const dataScatter =
    dataFilter.map(
      (item) => ({

        wind_speed:
          Number(
            item.wind_speed ?? 0
          ),

        wave_height:
          Number(
            item.wave_height ?? 0
          ),

        pelabuhan:
          namaSingkat(
            item.nama_pelabuhan
          ),

        waktu:
          item.waktu_utc,

      })
    );


  // ============================================================
  // KORELASI PEARSON
  // ============================================================

  let korelasi = 0;


  if (
    dataFilter.length >= 2
  ) {

    const x =
      dataFilter.map(
        (item) =>
          Number(
            item.wind_speed ?? 0
          )
      );


    const y =
      dataFilter.map(
        (item) =>
          Number(
            item.wave_height ?? 0
          )
      );


    const meanX =
      x.reduce(
        (a, b) =>
          a + b,
        0
      ) /
      x.length;


    const meanY =
      y.reduce(
        (a, b) =>
          a + b,
        0
      ) /
      y.length;


    let pembilang = 0;
    let penyebutX = 0;
    let penyebutY = 0;


    for (
      let i = 0;
      i < x.length;
      i++
    ) {

      const dx =
        x[i] -
        meanX;

      const dy =
        y[i] -
        meanY;


      pembilang +=
        dx * dy;

      penyebutX +=
        dx * dx;

      penyebutY +=
        dy * dy;

    }


    if (
      penyebutX > 0 &&
      penyebutY > 0
    ) {

      korelasi =
        pembilang /
        Math.sqrt(
          penyebutX *
          penyebutY
        );

    }

  }


  // ============================================================
  // MODEL TERBAIK
  // ============================================================

  const modelDenganHasil =
    hasilModel.filter(
      (item) =>
        item.rmse !== null &&
        item.rmse !== undefined
    );


  const modelTerbaik =
    modelDenganHasil.length > 0

      ? [
          ...modelDenganHasil
        ].sort(
          (a, b) =>
            Number(a.rmse) -
            Number(b.rmse)
        )[0]

      : null;


  // ============================================================
  // DATA MODEL CHART
  // ============================================================

  const dataModelChart =
    hasilModel.map(
      (item) => ({

        model:
          item.model,

        mae:
          Number(
            item.mae ?? 0
          ),

        rmse:
          Number(
            item.rmse ?? 0
          ),

      })
    );


  // ============================================================
  // DATA TERBARU
  // ============================================================

  const dataTerbaruTabel =
    urutTerbaru.slice(
      0,
      10
    );


  // ============================================================
  // LOADING
  // ============================================================

  if (
    loading &&
    data.length === 0
  ) {

    return (

      <div className="loading-screen">

        <div className="loading-content">

          <div className="loading-icon">
            
          </div>

          <h2>
            BMKG Maritim
          </h2>

          <p>
            Memuat data...
          </p>

        </div>

      </div>

    );

  }


  // ============================================================
  // ERROR
  // ============================================================

  if (
    error &&
    data.length === 0
  ) {

    return (

      <div className="error-screen">

        <div className="error-box">

          <div className="error-icon">
            
          </div>

          <h2>
            Data Belum Tersedia
          </h2>

          <p>
            {error}
          </p>

          <button
            className="refresh-button"
            onClick={
              ambilData
            }
          >
            Muat Ulang Data
          </button>

        </div>

      </div>

    );

  }


  // ============================================================
  // DASHBOARD
  // ============================================================

  return (

    <div className="app">


      {/* ======================================================
          HEADER
      ====================================================== */}

      {/* ======================================================
    HERO HEADER
====================================================== */}

<section className="hero-header">

  <div className="hero-top">

    <div className="hero-brand">

      <div>

        <p className="hero-eyebrow">
          DATA MONITORING MARITIM
        </p>

        <h1>
          BMKG Maritim
        </h1>

        <p className="hero-subtitle">
          Monitoring dan Prediksi Tinggi Gelombang pada 5 Pelabuhan
        </p>

      </div>

    </div>


    <div className="hero-actions">

      <div className="hero-status">

        <span className="hero-status-dot"></span>

        <div>

          <strong>
            Data Terhubung
          </strong>

          <small>
            API BMKG aktif
          </small>

        </div>

      </div>


      <button
        className="hero-refresh-button"
        onClick={ambilData}
      >
        
        <span>Refresh</span>
      </button>

    </div>

  </div>


  {/* ====================================================
      HERO SUMMARY
  ==================================================== */}

  <div className="hero-summary">


    <div className="hero-summary-item">

      <span>
        PELABUHAN
      </span>

      <strong>
        {jumlahPelabuhan}
      </strong>

      <small>
        lokasi terpantau
      </small>

    </div>


    <div className="hero-summary-item">

      <span>
        OBSERVASI
      </span>

      <strong>
        {totalData}
      </strong>

      <small>
        data terpilih
      </small>

    </div>


    <div className="hero-summary-item">

      <span>
        AVG GELOMBANG
      </span>

      <strong>
        {formatAngka(
          rataRataGelombang,
          2
        )}{" "}
        <em>m</em>
      </strong>

      <small>
        tinggi gelombang
      </small>

    </div>


    <div className="hero-summary-item">

      <span>
        PEMBARUAN TERAKHIR
      </span>

      <strong className="hero-time">

        {dataTerbaru
          ? formatWaktuUTC(
              dataTerbaru.waktu_utc
            )
          : "-"}

      </strong>

      <small>
        waktu data BMKG
      </small>

    </div>


  </div>


  {/* ====================================================
      HERO FOOTER
  ==================================================== */}
</section>

      {/* ======================================================
          FILTER
      ====================================================== */}

      <section className="filter-card">

        <div className="filter-heading">

          <p className="section-label">
            FILTER
          </p>

          <h3>
            Filter Data Pengamatan
          </h3>

        </div>


        <div className="filter-controls">

          <select
            value={
              pelabuhanDipilih
            }
            onChange={
              (event) =>
                setPelabuhanDipilih(
                  event.target.value
                )
            }
          >

            <option value="Semua Pelabuhan">
              Semua Pelabuhan
            </option>


            {daftarPelabuhan.map(
              (namaPelabuhan) => (

                <option
                  key={
                    namaPelabuhan
                  }
                  value={
                    namaPelabuhan
                  }
                >
                  {namaSingkat(
                    namaPelabuhan
                  )}
                </option>

              )
            )}

          </select>


          <select
            value={
              tanggalDipilih
            }
            onChange={
              (event) =>
                setTanggalDipilih(
                  event.target.value
                )
            }
          >

            <option value="Semua Tanggal">
              Semua Tanggal
            </option>


            {daftarTanggal.map(
              (tanggal) => (

                <option
                  key={
                    tanggal
                  }
                  value={
                    tanggal
                  }
                >
                  {tanggal}
                </option>

              )
            )}

          </select>

        </div>

      </section>


      {/* ======================================================
          KPI
      ====================================================== */}

      <section className="kpi-grid">


        <div className="kpi-card">

          <div className="kpi-top">

            <span>
              DATA TERPILIH
            </span>

          </div>

          <h2>
            {totalData}
          </h2>

          <p>
            Observasi BMKG
          </p>

        </div>


        <div className="kpi-card">

          <div className="kpi-top">

            <span>
              PELABUHAN
            </span>

          </div>

          <h2>
            {jumlahPelabuhan}
          </h2>

          <p>
            Pelabuhan terpilih
          </p>

        </div>


        <div className="kpi-card">

          <div className="kpi-top">

            <span>
              AVG GELOMBANG
            </span>

          </div>

          <h2>
            {formatAngka(
              rataRataGelombang,
              2
            )}
            {" "}
            m
          </h2>

          <p>
            Tinggi gelombang rata-rata
          </p>

        </div>


        <div className="kpi-card">

          <div className="kpi-top">

            <span>
              MAX GELOMBANG
            </span>

          </div>

          <h2>
            {formatAngka(
              gelombangMaksimum,
              2
            )}
            {" "}
            m
          </h2>

          <p>
            Nilai maksimum
          </p>

        </div>

      </section>


      {/* ======================================================
          KONDISI TERKINI
      ====================================================== */}

      <section className="current-card">

        <div className="current-main">

          <span className="section-label">
            KONDISI TERKINI
          </span>

          <h3>
            Tinggi Gelombang Terbaru
          </h3>

          <div className="current-value">

            {dataTerbaru
              ? formatAngka(
                  dataTerbaru.wave_height,
                  2
                )
              : "-"}
            {" "}
            m

          </div>

          <p>
            {dataTerbaru
              ? `${namaSingkat(dataTerbaru.nama_pelabuhan)} • ${formatWaktuUTC(dataTerbaru.waktu_utc)}`
              : "Belum ada data terbaru."}
          </p>

        </div>


        <div className="current-side">

          <div className="current-mini">

            <span>
              Kategori
            </span>

            <strong>
              {dataTerbaru?.wave_cat ||
                "-"}
            </strong>

          </div>


          <div className="current-mini">

            <span>
              Angin
            </span>

            <strong>
              {dataTerbaru
                ? `${formatAngka(dataTerbaru.wind_speed, 2)} m/s`
                : "-"}
            </strong>

          </div>


          <div className="current-mini">

            <span>
              Suhu
            </span>

            <strong>
              {dataTerbaru
                ? `${formatAngka(dataTerbaru.temp_avg, 2)} °C`
                : "-"}
            </strong>

          </div>

        </div>

      </section>


      {/* ======================================================
          TREND GELOMBANG
      ====================================================== */}

      <section className="dashboard-card">

        <div className="section-heading">

          <p className="section-label">
            TREN
          </p>

          <h3>
            Tren Tinggi Gelombang
          </h3>

          <p>
            Pergerakan tinggi gelombang
            selama periode pengamatan.
          </p>

        </div>


        <div className="large-chart">

          <ResponsiveContainer
            width="100%"
            height="100%"
          >

            <LineChart
              data={
                dataTrendGelombang
            }
            >

              <CartesianGrid
                strokeDasharray="3 3"
              />

              <XAxis
                dataKey="waktu"
                tickFormatter={
                  (value) =>
                    new Date(
                      value.replace(
                        " ",
                        "T"
                      ) + "Z"
                    ).toLocaleTimeString(
                      "id-ID",
                      {
                        timeZone:
                          "UTC",

                        hour:
                          "2-digit",

                        minute:
                          "2-digit",
                      }
                    )
                }
              />

              <YAxis
                unit=" m"
              />

              <Tooltip
                labelFormatter={
                  tooltipWaktu
                }
              />

              <Legend />


              {daftarPelabuhan
                .filter(
                  (namaPelabuhan) =>
                    pelabuhanDipilih ===
                      "Semua Pelabuhan" ||
                    namaPelabuhan ===
                      pelabuhanDipilih
                )
                .map(
                  (
                    namaPelabuhan
                  ) => {

                    const singkat =
                      namaSingkat(
                        namaPelabuhan
                      );


                    return (

                      <Line
                        key={
                          namaPelabuhan
                        }
                        type="monotone"
                        dataKey={
                          singkat
                        }
                        name={
                          singkat
                        }
                        stroke={
                          warnaPelabuhan[
                            singkat
                          ] ||
                          "#2b8c88"
                        }
                        strokeWidth={
                          2.5
                        }
                        dot={false}
                        activeDot={{
                          r: 5
                        }}
                      />

                    );

                  }
                )}

            </LineChart>

          </ResponsiveContainer>

        </div>

      </section>


      {/* ======================================================
          POLA CUACA
      ====================================================== */}

      <section className="dashboard-card">

        <div className="section-heading">

          <p className="section-label">
            KONDISI CUACA
          </p>

          <h3>
            Pola Angin, Suhu, dan Kelembapan
          </h3>

          <p>
            Perubahan variabel cuaca selama
            periode pengamatan.
          </p>

        </div>


        <div className="weather-chart-grid">


          {/* ANGIN */}

          <div className="mini-chart-card">

            <div className="mini-chart-heading">

              <h4>
                Kecepatan Angin
              </h4>

              <span>
                Rata-rata
                {" "}
                {formatAngka(
                  rataRataAngin,
                  2
                )}
                {" "}
                m/s
              </span>

            </div>


            <div className="mini-chart">

              <ResponsiveContainer
                width="100%"
                height="100%"
              >

                <LineChart
                  data={
                    dataTrendAngin
                  }
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    dataKey="waktu"
                    tickFormatter={
                      (value) =>
                        new Date(
                          value.replace(
                            " ",
                            "T"
                          ) + "Z"
                        ).toLocaleTimeString(
                          "id-ID",
                          {
                            timeZone:
                              "UTC",

                            hour:
                              "2-digit",
                          }
                        )
                    }
                  />

                  <YAxis />

                  <Tooltip
                    labelFormatter={
                      tooltipWaktu
                    }
                  />

                  <Legend />


                  {daftarPelabuhan
                    .filter(
                      (namaPelabuhan) =>
                        pelabuhanDipilih ===
                          "Semua Pelabuhan" ||
                        namaPelabuhan ===
                          pelabuhanDipilih
                    )
                    .map(
                      (
                        namaPelabuhan
                      ) => {

                        const singkat =
                          namaSingkat(
                            namaPelabuhan
                          );


                        return (

                          <Line
                            key={
                              namaPelabuhan
                            }
                            type="monotone"
                            dataKey={
                              singkat
                            }
                            name={
                              singkat
                            }
                            stroke={
                              warnaPelabuhan[
                                singkat
                              ] ||
                              "#2b8c88"
                            }
                            strokeWidth={
                              2
                            }
                            dot={false}
                          />

                        );

                      }
                    )}

                </LineChart>

              </ResponsiveContainer>

            </div>

          </div>


          {/* SUHU */}

          <div className="mini-chart-card">

            <div className="mini-chart-heading">

              <h4>
                Suhu
              </h4>

              <span>
                Rata-rata
                {" "}
                {formatAngka(
                  rataRataSuhu,
                  2
                )}
                {" "}
                °C
              </span>

            </div>


            <div className="mini-chart">

              <ResponsiveContainer
                width="100%"
                height="100%"
              >

                <LineChart
                  data={
                    dataTrendSuhu
                  }
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    dataKey="waktu"
                    tickFormatter={
                      (value) =>
                        new Date(
                          value.replace(
                            " ",
                            "T"
                          ) + "Z"
                        ).toLocaleTimeString(
                          "id-ID",
                          {
                            timeZone:
                              "UTC",

                            hour:
                              "2-digit",
                          }
                        )
                    }
                  />

                  <YAxis />

                  <Tooltip
                    labelFormatter={
                      tooltipWaktu
                    }
                  />

                  <Legend />


                  {daftarPelabuhan
                    .filter(
                      (namaPelabuhan) =>
                        pelabuhanDipilih ===
                          "Semua Pelabuhan" ||
                        namaPelabuhan ===
                          pelabuhanDipilih
                    )
                    .map(
                      (
                        namaPelabuhan
                      ) => {

                        const singkat =
                          namaSingkat(
                            namaPelabuhan
                          );


                        return (

                          <Line
                            key={
                              namaPelabuhan
                            }
                            type="monotone"
                            dataKey={
                              singkat
                            }
                            name={
                              singkat
                            }
                            stroke={
                              warnaPelabuhan[
                                singkat
                              ] ||
                              "#d8894a"
                            }
                            strokeWidth={
                              2
                            }
                            dot={false}
                          />

                        );

                      }
                    )}

                </LineChart>

              </ResponsiveContainer>

            </div>

          </div>


          {/* KELEMBAPAN */}

          <div className="mini-chart-card">

            <div className="mini-chart-heading">

              <h4>
                Kelembapan
              </h4>

              <span>
                Rata-rata
                {" "}
                {totalData > 0
                  ? formatAngka(
                      dataFilter.reduce(
                        (total, item) =>
                          total +
                          Number(
                            item.rh_avg ?? 0
                          ),
                        0
                      ) /
                      totalData,
                      2
                    )
                  : "-"}
                {" "}
                %
              </span>

            </div>


            <div className="mini-chart">

              <ResponsiveContainer
                width="100%"
                height="100%"
              >

                <LineChart
                  data={
                    dataTrendKelembapan
                  }
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    dataKey="waktu"
                    tickFormatter={
                      (value) =>
                        new Date(
                          value.replace(
                            " ",
                            "T"
                          ) + "Z"
                        ).toLocaleTimeString(
                          "id-ID",
                          {
                            timeZone:
                              "UTC",

                            hour:
                              "2-digit",
                          }
                        )
                    }
                  />

                  <YAxis />

                  <Tooltip
                    labelFormatter={
                      tooltipWaktu
                    }
                  />

                  <Legend />


                  {daftarPelabuhan
                    .filter(
                      (namaPelabuhan) =>
                        pelabuhanDipilih ===
                          "Semua Pelabuhan" ||
                        namaPelabuhan ===
                          pelabuhanDipilih
                    )
                    .map(
                      (
                        namaPelabuhan
                      ) => {

                        const singkat =
                          namaSingkat(
                            namaPelabuhan
                          );


                        return (

                          <Line
                            key={
                              namaPelabuhan
                            }
                            type="monotone"
                            dataKey={
                              singkat
                            }
                            name={
                              singkat
                            }
                            stroke={
                              warnaPelabuhan[
                                singkat
                              ] ||
                              "#8b68ad"
                            }
                            strokeWidth={
                              2
                            }
                            dot={false}
                          />

                        );

                      }
                    )}

                </LineChart>

              </ResponsiveContainer>

            </div>

          </div>

        </div>

      </section>


      {/* ======================================================
          PERBANDINGAN KONDISI MARITIM
      ====================================================== */}

      <section className="dashboard-card">

        <div className="section-heading">

          <p className="section-label">
            PERBANDINGAN
          </p>

          <h3>
            Perbandingan Kondisi Maritim
          </h3>

          <p>
            Perbandingan rata-rata gelombang,
            angin, dan arus pada masing-masing
            pelabuhan.
          </p>

        </div>


        {/* TABEL 1 */}

        <div className="table-wrapper">

          <table>

            <thead>

              <tr>

                <th>
                  Pelabuhan
                </th>

                <th>
                  Data
                </th>

                <th>
                  Avg Gelombang
                </th>

                <th>
                  Avg Angin
                </th>

                <th>
                  Avg Arus
                </th>

                <th>
                  Kedalaman
                </th>

              </tr>

            </thead>


            <tbody>

              {ringkasanPelabuhan.map(
                (item) => (

                  <tr
                    key={
                      item.kode
                    }
                  >

                    <td>
                      <strong>
                        {item.pelabuhan}
                      </strong>
                    </td>

                    <td>
                      {item.jumlah}
                    </td>

                    <td>
                      {formatAngka(
                        item.rataGelombang,
                        3
                      )}
                      {" "}
                      m
                    </td>

                    <td>
                      {formatAngka(
                        item.rataAngin,
                        2
                      )}
                      {" "}
                      m/s
                    </td>

                    <td>
                      {formatAngka(
                        item.rataArus,
                        2
                      )}
                      {" "}
                      m/s
                    </td>

                    <td>
                      {item.kedalaman > 0
                        ? `${formatAngka(item.kedalaman, 2)} m`
                        : "-"}
                    </td>

                  </tr>

                )
              )}

            </tbody>

          </table>

        </div>


        {/* GRAFIK HORIZONTAL */}

        <div className="horizontal-chart-grid">


          {/* GELOMBANG */}

          <div className="horizontal-chart-card">

            <div className="mini-chart-heading">

              <h4>
                Rata-rata Tinggi Gelombang
              </h4>

              <span>
                meter
              </span>

            </div>


            <div className="horizontal-chart">

              <ResponsiveContainer
                width="100%"
                height="100%"
              >

                <BarChart
                  data={
                    dataBarGelombang
                  }
                  layout="vertical"
                  margin={{
                    top: 5,
                    right: 15,
                    left: 10,
                    bottom: 5,
                  }}
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    type="number"
                  />

                  <YAxis
                    type="category"
                    dataKey="pelabuhan"
                    width={120}
                    tick={{
                      fontSize: 10
                    }}
                  />

                  <Tooltip />


                  <Bar
                    dataKey="nilai"
                    name="Gelombang"
                    fill="#2b8c88"
                    radius={[
                      0,
                      6,
                      6,
                      0
                    ]}
                  />

                </BarChart>

              </ResponsiveContainer>

            </div>

          </div>


          {/* ANGIN */}

          <div className="horizontal-chart-card">

            <div className="mini-chart-heading">

              <h4>
                Rata-rata Angin
              </h4>

              <span>
                m/s
              </span>

            </div>


            <div className="horizontal-chart">

              <ResponsiveContainer
                width="100%"
                height="100%"
              >

                <BarChart
                  data={
                    dataBarAngin
                  }
                  layout="vertical"
                  margin={{
                    top: 5,
                    right: 15,
                    left: 10,
                    bottom: 5,
                  }}
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    type="number"
                  />

                  <YAxis
                    type="category"
                    dataKey="pelabuhan"
                    width={120}
                    tick={{
                      fontSize: 10
                    }}
                  />

                  <Tooltip />


                  <Bar
                    dataKey="nilai"
                    name="Angin"
                    fill="#4f78b7"
                    radius={[
                      0,
                      6,
                      6,
                      0
                    ]}
                  />

                </BarChart>

              </ResponsiveContainer>

            </div>

          </div>


          {/* ARUS */}

          <div className="horizontal-chart-card">

            <div className="mini-chart-heading">

              <h4>
                Rata-rata Arus
              </h4>

              <span>
                m/s
              </span>

            </div>


            <div className="horizontal-chart">

              <ResponsiveContainer
                width="100%"
                height="100%"
              >

                <BarChart
                  data={
                    dataBarArus
                  }
                  layout="vertical"
                  margin={{
                    top: 5,
                    right: 15,
                    left: 10,
                    bottom: 5,
                  }}
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    type="number"
                  />

                  <YAxis
                    type="category"
                    dataKey="pelabuhan"
                    width={120}
                    tick={{
                      fontSize: 10
                    }}
                  />

                  <Tooltip />


                  <Bar
                    dataKey="nilai"
                    name="Arus"
                    fill="#8b68ad"
                    radius={[
                      0,
                      6,
                      6,
                      0
                    ]}
                  />

                </BarChart>

              </ResponsiveContainer>

            </div>

          </div>

        </div>


        {/* KEDALAMAN */}

        {dataBarKedalaman.length > 0 && (

          <div className="depth-section">

            <div className="mini-chart-heading">

              <div>

                <h4>
                  Kedalaman Pelabuhan
                </h4>

                <p>
                  Data batimetri GEBCO yang
                  digunakan sebagai informasi
                  kondisi fisik dan fitur model.
                </p>

              </div>

              <span>
                meter
              </span>

            </div>


            <div className="depth-chart">

              <ResponsiveContainer
                width="100%"
                height="100%"
              >

                <BarChart
                  data={
                    dataBarKedalaman
                  }
                  layout="vertical"
                  margin={{
                    top: 5,
                    right: 20,
                    left: 10,
                    bottom: 5,
                  }}
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    type="number"
                  />

                  <YAxis
                    type="category"
                    dataKey="pelabuhan"
                    width={130}
                    tick={{
                      fontSize: 10
                    }}
                  />

                  <Tooltip />


                  <Bar
                    dataKey="nilai"
                    name="Kedalaman GEBCO"
                    fill="#d8894a"
                    radius={[
                      0,
                      6,
                      6,
                      0
                    ]}
                  />

                </BarChart>

              </ResponsiveContainer>

            </div>

          </div>

        )}

      </section>


      {/* ======================================================
          MACHINE LEARNING
      ====================================================== */}

      <section className="dashboard-card">

        <div className="section-heading">

          <p className="section-label">
            PREDIKSI
          </p>

          <h3>
            Prediksi Tinggi Gelombang
          </h3>

          <p>
            Ringkasan performa model regresi
            berdasarkan hasil evaluasi.
          </p>

        </div>


        {modelTerbaik ? (

          <>

            <div className="model-summary-grid">


              <div className="model-best-card">

                <span>
                  MODEL TERBAIK
                </span>

                <strong>
                  {modelTerbaik.model}
                </strong>

                <p>
                  Performa terbaik berdasarkan
                  RMSE terendah.
                </p>

              </div>


              <div className="metric-box">

                <span>
                  MAE
                </span>

                <strong>
                  {formatAngka(
                    modelTerbaik.mae,
                    4
                  )}
                </strong>

                <small>
                  meter
                </small>

              </div>


              <div className="metric-box">

                <span>
                  RMSE
                </span>

                <strong>
                  {formatAngka(
                    modelTerbaik.rmse,
                    4
                  )}
                </strong>

                <small>
                  meter
                </small>

              </div>


              <div className="metric-box">

                <span>
                  R²
                </span>

                <strong>
                  {formatAngka(
                    modelTerbaik.r2,
                    4
                  )}
                </strong>

                <small>
                  koefisien determinasi
                </small>

              </div>

            </div>


            {/* TABEL 2 */}

            <div className="table-wrapper model-table">

              <table>

                <thead>

                  <tr>

                    <th>
                      Model
                    </th>

                    <th>
                      MAE
                    </th>

                    <th>
                      RMSE
                    </th>

                    <th>
                      R²
                    </th>

                  </tr>

                </thead>


                <tbody>

                  {hasilModel.map(
                    (item) => (

                      <tr
                        key={
                          item.model
                        }
                      >

                        <td>
                          <strong>
                            {item.model}
                          </strong>
                        </td>

                        <td>
                          {formatAngka(
                            item.mae,
                            4
                          )}
                        </td>

                        <td>
                          {formatAngka(
                            item.rmse,
                            4
                          )}
                        </td>

                        <td>
                          {formatAngka(
                            item.r2,
                            4
                          )}
                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>


            <div className="medium-chart">

              <ResponsiveContainer
                width="100%"
                height="100%"
              >

                <BarChart
                  data={
                    dataModelChart
                  }
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    dataKey="model"
                  />

                  <YAxis />

                  <Tooltip />

                  <Legend />


                  <Bar
                    dataKey="mae"
                    name="MAE"
                    fill="#2b8c88"
                    radius={[
                      6,
                      6,
                      0,
                      0
                    ]}
                  />


                  <Bar
                    dataKey="rmse"
                    name="RMSE"
                    fill="#4f78b7"
                    radius={[
                      6,
                      6,
                      0,
                      0
                    ]}
                  />

                </BarChart>

              </ResponsiveContainer>

            </div>


            

          </>

        ) : (

          <div className="empty-analysis">

            <strong>
              Hasil model belum tersedia.
            </strong>

            <p>
              Pastikan file hasil_dashboard.json
              sudah dibuat dari Jupyter dan
              endpoint /analysis dapat diakses
              oleh FastAPI.
            </p>

          </div>

        )}

      </section>


      {/* ======================================================
          INSIGHT HUBUNGAN ANGIN
      ====================================================== */}

      <section className="dashboard-card">

        <div className="section-heading">

          <p className="section-label">
            HUBUNGAN VARIABEL
          </p>

          <h3>
            Kecepatan Angin dan Tinggi Gelombang
          </h3>

          <p>
            Hubungan statistik antara
            kecepatan angin dan tinggi
            gelombang.
          </p>

        </div>


        <div className="correlation-highlight">

          <div>

            <span>
              Pearson Correlation
            </span>

            <strong>
              {formatAngka(
                korelasi,
                4
              )}
            </strong>

          </div>


          <p>
            Korelasi menunjukkan hubungan
            linear, bukan sebab-akibat.
          </p>

        </div>


        <div className="medium-chart scatter-chart">

          <ResponsiveContainer
            width="100%"
            height="100%"
          >

            <ScatterChart>

              <CartesianGrid />

              <XAxis
                type="number"
                dataKey="wind_speed"
                name="Kecepatan Angin"
                unit=" m/s"
              />

              <YAxis
                type="number"
                dataKey="wave_height"
                name="Tinggi Gelombang"
                unit=" m"
              />

              <Tooltip />

              <Scatter
                name="Observasi BMKG"
                data={
                  dataScatter
                }
                fill="#2b8c88"
              />

            </ScatterChart>

          </ResponsiveContainer>

        </div>

      </section>


      {/* ======================================================
          VALIDASI ERA5
      ====================================================== */}

      <section className="dashboard-card">

        <div className="section-heading">

          <p className="section-label">
            VALIDASI DATA
          </p>

          <h3>
            Perbandingan BMKG dan ERA5
          </h3>

          <p>
            Ringkasan perbandingan data
            gelombang BMKG dengan ERA5.
          </p>

        </div>


        <div className="era5-grid">


          <div className="metric-box">

            <span>
              MATCHED
            </span>

            <strong>
              {era5Summary.matched}
            </strong>

            <small>
              observasi
            </small>

          </div>


          <div className="metric-box">

            <span>
              BIAS
            </span>

            <strong>
              {formatAngka(
                era5Summary.bias,
                4
              )}
            </strong>

            <small>
              meter
            </small>

          </div>


          <div className="metric-box">

            <span>
              MAE
            </span>

            <strong>
              {formatAngka(
                era5Summary.mae,
                4
              )}
            </strong>

            <small>
              meter
            </small>

          </div>


          <div className="metric-box">

            <span>
              RMSE
            </span>

            <strong>
              {formatAngka(
                era5Summary.rmse,
                4
              )}
            </strong>

            <small>
              meter
            </small>

          </div>


          <div className="metric-box">

            <span>
              PEARSON
            </span>

            <strong>
              {formatAngka(
                era5Summary.pearson,
                4
              )}
            </strong>

          </div>

        </div>


        {era5PerPelabuhan.length > 0 && (

          <div className="era5-insight-list">

            {era5PerPelabuhan.map(
              (item) => (

                <div
                  className="era5-item"
                  key={
                    item.pelabuhan
                  }
                >

                  <strong>
                    {item.pelabuhan}
                  </strong>

                  <span>
                    Bias
                    {" "}
                    {formatAngka(
                      item.bias,
                      4
                    )}
                    {" "}
                    m
                  </span>

                  <span>
                    MAE
                    {" "}
                    {formatAngka(
                      item.mae,
                      4
                    )}
                    {" "}
                    m
                  </span>

                </div>

              )
            )}

          </div>

        )}

      </section>


      {/* ======================================================
          TABEL 3 - DATA TERBARU
      ====================================================== */}

      <section className="dashboard-card">

        <div className="section-heading">

          <p className="section-label">
            DATA TERBARU
          </p>

          <h3>
            Observasi BMKG Terbaru
          </h3>

          <p>
            Beberapa observasi terbaru yang
            mendasari informasi dashboard.
          </p>

        </div>


        <div className="table-wrapper">

          <table>

            <thead>

              <tr>

                <th>
                  Waktu UTC
                </th>

                <th>
                  Pelabuhan
                </th>

                <th>
                  Cuaca
                </th>

                <th>
                  Angin
                </th>

                <th>
                  Gelombang
                </th>

                <th>
                  Kategori
                </th>

              </tr>

            </thead>


            <tbody>

              {dataTerbaruTabel.map(
                (item, index) => (

                  <tr
                    key={
                      `${item.kode_pelabuhan}-${item.waktu_utc}-${index}`
                    }
                  >

                    <td>
                      {formatWaktuUTC(
                        item.waktu_utc
                      )}
                    </td>

                    <td>
                      <strong>
                        {namaSingkat(
                          item.nama_pelabuhan
                        )}
                      </strong>
                    </td>

                    <td>
                      {item.weather}
                    </td>

                    <td>
                      {formatAngka(
                        item.wind_speed,
                        2
                      )}
                      {" "}
                      m/s
                    </td>

                    <td>
                      <strong>
                        {formatAngka(
                          item.wave_height,
                          2
                        )}
                        {" "}
                        m
                      </strong>
                    </td>

                    <td>
                      {item.wave_cat}
                    </td>

                  </tr>

                )
              )}

            </tbody>

          </table>

        </div>

      </section>


      {/* ======================================================
          METADATA
      ====================================================== */}

      <section className="metadata">

        <div>

          <p className="section-label">
            SUMBER DATA
          </p>

          <h3>
            Sumber Data dan Pengolahan
          </h3>

        </div>


        <div className="metadata-grid">


          <div>

            <span>
              Sumber utama
            </span>

            <strong>
              BMKG Maritim
            </strong>

          </div>


          <div>

            <span>
              Sumber tambahan
            </span>

            <strong>
              ERA5 + GEBCO
            </strong>

          </div>


          <div>

            <span>
              Wilayah
            </span>

            <strong>
              Sulawesi Tenggara
            </strong>

          </div>


          <div>

            <span>
              Pelabuhan
            </span>

            <strong>
              {jumlahPelabuhan}
            </strong>

          </div>


          <div>

            <span>
              Database
            </span>

            <strong>
              MySQL
            </strong>

          </div>


          <div>

            <span>
              Update
            </span>

            <strong>

              {waktuRefresh
                ? waktuRefresh.toLocaleTimeString(
                    "id-ID"
                  )
                : "-"}

            </strong>

          </div>

        </div>

      </section>


      {/* ======================================================
          FOOTER
      ====================================================== */}
</div>

  );

}


export default App;