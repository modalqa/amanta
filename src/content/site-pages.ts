// Long-form content for the public pages. Kept out of the UI dictionaries because it is prose, not interface text.
// Legal pages are DRAFTS that describe how the software behaves today; company facts are left as [placeholders]
// on purpose and must be completed (and reviewed by counsel) by whoever operates Amanta.

export type SiteSlug = "tentang" | "keamanan" | "kontak" | "syarat-ketentuan" | "kebijakan-privasi";
export type Block = { id: string; h: string; p?: string[]; list?: string[] };
export type SitePage = { title: string; lead: string; draft?: boolean; updated?: string; blocks: Block[] };

export const SITE_SLUGS: SiteSlug[] = ["tentang", "keamanan", "kontak", "syarat-ketentuan", "kebijakan-privasi"];

const UPDATED = "2026-10-28";

export const SITE_PAGES: Record<SiteSlug, Record<"id" | "en", SitePage>> = {
  tentang: {
    id: {
      title: "Tentang Amanta",
      lead: "Amanta membantu pabrik makanan dan minuman di Indonesia menjalankan keamanan pangan dari catatan, bukan dari ingatan.",
      blocks: [
        { id: "masalah", h: "Masalah yang kami selesaikan", p: [
          "Di banyak pabrik, rencana HACCP tersimpan di map, checklist shift diisi di kertas, dan sertifikat pemasok dipantau lewat spreadsheet dan grup chat. Saat audit, tim QA menghabiskan berhari-hari menyusun ulang bukti yang sebenarnya sudah ada.",
          "Amanta menghubungkan semuanya: dokumen SOP menjadi kontrol HACCP yang disetujui, kontrol menjadi checklist yang diisi setiap shift, dan setiap penyimpangan tercatat sampai CAPA-nya terverifikasi.",
        ] },
        { id: "prinsip", h: "Prinsip kami", list: [
          "AI menyusun draf, manusia yang memutuskan. Tidak ada kontrol atau checklist yang aktif tanpa persetujuan orang yang berwenang.",
          "Bahasa Indonesia lebih dulu, dengan istilah yang dipakai di lantai produksi.",
          "Data pelanggan milik pelanggan. Data setiap perusahaan dipisah, dan perusahaan boleh memakai penyedia AI serta API key sendiri.",
          "Jujur soal batas. Amanta adalah alat pencatatan dan alur kerja, bukan produk sertifikasi.",
        ] },
        { id: "untuk-siapa", h: "Untuk siapa", p: [
          "Pemilik usaha, manajer QA, supervisor produksi, operator, dan auditor internal di industri pangan olahan, dari usaha kecil sampai menengah, yang sedang menyiapkan atau menjalankan HACCP, CPPOB, sertifikasi halal, atau standar seperti ISO 22000 dan FSSC 22000.",
        ] },
        { id: "perusahaan", h: "Perusahaan", p: [
          "Amanta dikelola oleh [lengkapi: nama badan usaha], [lengkapi: alamat terdaftar]. Nama \"Amanta\" saat ini adalah nama sementara; ketersediaan mereknya masih perlu diperiksa.",
        ] },
      ],
    },
    en: {
      title: "About Amanta",
      lead: "Amanta helps food and beverage manufacturers in Indonesia run food safety from records, not from memory.",
      blocks: [
        { id: "masalah", h: "The problem we solve", p: [
          "In many plants, the HACCP plan lives in a binder, shift checklists are filled in on paper, and supplier certificates are tracked in spreadsheets and chat groups. At audit time, QA teams spend days rebuilding evidence that already exists.",
          "Amanta connects it all: SOPs become approved HACCP controls, controls become checklists filled in every shift, and every deviation is recorded until its CAPA is verified.",
        ] },
        { id: "prinsip", h: "Our principles", list: [
          "AI drafts, people decide. No control or checklist goes live without approval by someone authorized.",
          "Indonesian first, using the terms people use on the production floor.",
          "Customer data belongs to the customer. Each company's data is kept separate, and companies may use their own AI provider and API key.",
          "Honest about limits. Amanta is a record-keeping and workflow tool, not a certification product.",
        ] },
        { id: "untuk-siapa", h: "Who it is for", p: [
          "Owners, QA managers, production supervisors, operators and internal auditors in processed-food manufacturing, from small to mid-sized companies, who are preparing for or running HACCP, GMP (CPPOB), halal certification, or standards such as ISO 22000 and FSSC 22000.",
        ] },
        { id: "perusahaan", h: "Company", p: [
          "Amanta is operated by [complete: legal entity name], [complete: registered address]. \"Amanta\" is currently a working name; trademark availability still needs to be checked.",
        ] },
      ],
    },
  },

  keamanan: {
    id: {
      title: "Keamanan",
      lead: "Cara Amanta melindungi data perusahaan Anda, dan apa yang masih kami kerjakan.",
      updated: UPDATED,
      blocks: [
        { id: "pemisahan", h: "Data setiap perusahaan terpisah", p: ["Setiap permintaan data dibatasi ke perusahaan yang sedang aktif, dan ID yang dikirim pengguna dicek kepemilikannya sebelum dipakai. Pengujian otomatis memastikan satu perusahaan tidak bisa membaca atau mengubah data perusahaan lain."] },
        { id: "akses", h: "Akses sesuai peran", p: ["Enam peran (Pemilik, Admin, Manajer QA, Supervisor, Operator, Auditor). Izin dicek di server untuk setiap tindakan, bukan hanya disembunyikan di tampilan. Login dibatasi jumlah percobaannya, dan akun dikunci sementara setelah beberapa kali gagal."] },
        { id: "enkripsi", h: "Enkripsi dan kata sandi", list: [
          "Kata sandi disimpan sebagai hash Argon2, bukan teks asli.",
          "API key AI milik perusahaan disimpan terenkripsi AES-256-GCM dan tidak pernah ditampilkan lagi.",
          "API key integrasi dan token sesi hanya disimpan dalam bentuk hash SHA-256.",
        ] },
        { id: "berkas", h: "Berkas yang diunggah", p: ["Jenis berkas dicek dari isinya, bukan hanya dari ekstensi. Setiap berkas diberi sidik jari SHA-256 dan dicek ulang setiap kali diunduh, dan berkas hanya bisa diunduh lewat jalur yang memeriksa izin."] },
        { id: "ai", h: "AI", list: [
          "Isi dokumen diperlakukan sebagai data yang belum tepercaya di dalam perintah ke AI.",
          "Keluaran AI dicek formatnya dan hanya disimpan sebagai draf.",
          "Untuk AI milik perusahaan (BYOK), alamat penyedia wajib HTTPS dan tidak boleh mengarah ke jaringan internal.",
        ] },
        { id: "audit", h: "Jejak audit", p: ["Setiap perubahan, unduhan, dan laporan tercatat dalam log yang tidak bisa diubah atau dihapus di tingkat database. Keutuhan catatan bisa diperiksa dari aplikasi dan disertakan dalam paket audit."] },
        { id: "rencana", h: "Yang masih kami kerjakan", p: ["Kami lebih suka jujur soal ini:"], list: [
          "Verifikasi dua langkah (MFA) dan SSO belum tersedia.",
          "Row-level security PostgreSQL sebagai lapisan isolasi kedua belum diterapkan.",
          "Pemindaian malware untuk berkas yang diunggah belum tersedia.",
          "Uji penetrasi oleh pihak luar belum dilakukan.",
        ] },
        { id: "laporkan", h: "Melaporkan celah keamanan", p: ["Jika menemukan celah keamanan, kirim laporan ke [lengkapi: email keamanan]. Mohon jangan mengakses data milik orang lain dan jangan mengungkapkan celah ke publik sebelum kami sempat memperbaikinya."] },
      ],
    },
    en: {
      title: "Security",
      lead: "How Amanta protects your company's data, and what we are still working on.",
      updated: UPDATED,
      blocks: [
        { id: "pemisahan", h: "Each company's data is separate", p: ["Every data request is scoped to the active company, and IDs supplied by users are checked for ownership before use. Automated tests confirm that one company cannot read or change another company's data."] },
        { id: "akses", h: "Role-based access", p: ["Six roles (Owner, Admin, QA Manager, Supervisor, Operator, Auditor). Permissions are checked on the server for every action, not just hidden in the interface. Login attempts are rate-limited, and accounts lock temporarily after repeated failures."] },
        { id: "enkripsi", h: "Encryption and passwords", list: [
          "Passwords are stored as Argon2 hashes, never as plain text.",
          "A company's own AI API key is stored encrypted with AES-256-GCM and is never shown again.",
          "Integration API keys and session tokens are stored only as SHA-256 hashes.",
        ] },
        { id: "berkas", h: "Uploaded files", p: ["File types are checked from their content, not only their extension. Each file gets a SHA-256 fingerprint that is checked again on every download, and files can only be downloaded through a route that checks permissions."] },
        { id: "ai", h: "AI", list: [
          "Document content is treated as untrusted data inside AI prompts.",
          "AI output is format-checked and stored only as a draft.",
          "For a company's own AI (BYOK), the provider address must use HTTPS and may not point to an internal network.",
        ] },
        { id: "audit", h: "Audit trail", p: ["Every change, download and report is recorded in a log that cannot be edited or deleted at the database level. You can check the record's integrity from the app, and it is included in the audit package."] },
        { id: "rencana", h: "What we are still working on", p: ["We would rather be upfront about this:"], list: [
          "Two-step verification (MFA) and SSO are not available yet.",
          "PostgreSQL row-level security as a second isolation layer is not in place yet.",
          "Malware scanning of uploads is not available yet.",
          "No external penetration test has been done yet.",
        ] },
        { id: "laporkan", h: "Reporting a vulnerability", p: ["If you find a security issue, send a report to [complete: security email]. Please do not access other people's data, and do not disclose the issue publicly before we have had a chance to fix it."] },
      ],
    },
  },

  kontak: {
    id: {
      title: "Kontak",
      lead: "Pertanyaan tentang Amanta, kerja sama, atau dukungan teknis.",
      blocks: [
        { id: "pengguna", h: "Sudah memakai Amanta?", p: ["Untuk akses akun, peran, atau pengaturan AI, hubungi Pemilik atau Admin di perusahaan Anda terlebih dahulu. Mereka bisa mengundang anggota, mengubah peran, dan mengatur penyedia AI dari menu Pengaturan."] },
        { id: "hubungi", h: "Hubungi kami", list: [
          "Email: [lengkapi: email dukungan]",
          "Telepon/WhatsApp: [lengkapi: nomor]",
          "Alamat: [lengkapi: alamat kantor]",
          "Jam layanan: [lengkapi: hari dan jam, zona waktu]",
        ] },
        { id: "keamanan", h: "Laporan keamanan", p: ["Celah keamanan dilaporkan lewat jalur khusus. Lihat halaman Keamanan."] },
        { id: "privasi", h: "Permintaan terkait data pribadi", p: ["Untuk permintaan akses, perbaikan, atau penghapusan data pribadi, lihat halaman Kebijakan Privasi."] },
      ],
    },
    en: {
      title: "Contact",
      lead: "Questions about Amanta, partnerships or technical support.",
      blocks: [
        { id: "pengguna", h: "Already using Amanta?", p: ["For account access, roles or AI settings, contact the Owner or Admin at your company first. They can invite members, change roles and set up the AI provider from Settings."] },
        { id: "hubungi", h: "Get in touch", list: [
          "Email: [complete: support email]",
          "Phone/WhatsApp: [complete: number]",
          "Address: [complete: office address]",
          "Support hours: [complete: days and hours, time zone]",
        ] },
        { id: "keamanan", h: "Security reports", p: ["Security issues have their own reporting channel. See the Security page."] },
        { id: "privasi", h: "Personal data requests", p: ["For requests to access, correct or delete personal data, see the Privacy Policy."] },
      ],
    },
  },

  "syarat-ketentuan": {
    id: {
      title: "Syarat & Ketentuan",
      lead: "Ketentuan penggunaan layanan Amanta.",
      draft: true,
      updated: UPDATED,
      blocks: [
        { id: "para-pihak", h: "1. Para pihak dan persetujuan", p: ["Layanan Amanta disediakan oleh [lengkapi: nama badan usaha] (\"kami\"). Dengan mendaftarkan perusahaan atau memakai Amanta, Anda menyetujui ketentuan ini atas nama perusahaan yang Anda wakili (\"Pelanggan\"). Jika Anda tidak berwenang mewakili perusahaan tersebut, jangan mendaftar."] },
        { id: "layanan", h: "2. Layanan", p: ["Amanta adalah perangkat lunak untuk mencatat dan menjalankan alur kerja keamanan dan mutu pangan: dokumen, kontrol HACCP, checklist, pemantauan CCP, deviasi, CAPA, pemasok, ketertelusuran, laporan, dan jejak audit."] },
        { id: "bukan-sertifikasi", h: "3. Bukan sertifikasi dan bukan nasihat profesional", list: [
          "Amanta tidak menerbitkan, menjamin, atau menggantikan sertifikasi apa pun, termasuk dari BPOM, BPJPH, atau lembaga sertifikasi.",
          "Template dan draf yang disusun AI dapat keliru atau tidak lengkap. Pelanggan wajib memvalidasinya melalui personel keamanan pangan yang kompeten sebelum dipakai.",
          "Keputusan keamanan pangan, termasuk rilis, penahanan, dan penarikan produk, tetap menjadi tanggung jawab Pelanggan.",
        ] },
        { id: "akun", h: "4. Akun dan peran", p: ["Pemilik organisasi bertanggung jawab atas siapa yang diundang dan peran yang diberikan. Setiap pengguna wajib menjaga kerahasiaan kata sandinya dan segera memberi tahu Admin perusahaannya bila menduga akunnya disalahgunakan."] },
        { id: "konten", h: "5. Data dan konten Pelanggan", list: [
          "Data dan dokumen yang diunggah tetap milik Pelanggan.",
          "Pelanggan memberi kami izin terbatas untuk menyimpan dan memproses data tersebut semata-mata untuk menyediakan layanan.",
          "Pelanggan menjamin berhak mengunggah konten tersebut, dan bila konten memuat data pribadi, memprosesnya sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.",
        ] },
        { id: "ai", h: "6. AI dan penyedia pihak ketiga", p: ["Fitur AI mengirim isi dokumen dan deviasi ke penyedia AI yang aktif untuk Pelanggan. Jika Pelanggan memakai penyedia dan API key sendiri (BYOK), hubungan Pelanggan dengan penyedia tersebut, termasuk biaya, kuota, dan pemrosesan data, diatur oleh perjanjian antara Pelanggan dan penyedia itu. Kami tidak bertanggung jawab atas layanan penyedia pihak ketiga."] },
        { id: "larangan", h: "7. Penggunaan yang dilarang", list: [
          "Mencoba mengakses data perusahaan lain atau melewati pembatasan peran.",
          "Mengunggah malware atau konten yang melanggar hukum.",
          "Memakai API secara berlebihan sehingga mengganggu layanan, atau memakai API key di luar cakupan yang diberikan.",
          "Mengarahkan pengaturan AI ke alamat yang bukan milik penyedia AI yang sah.",
        ] },
        { id: "ketersediaan", h: "8. Ketersediaan dan perubahan layanan", p: ["[lengkapi: tingkat layanan (SLA), jadwal pemeliharaan, dan cara pemberitahuan perubahan]. Tanpa perjanjian tertulis terpisah, layanan disediakan tanpa jaminan ketersediaan tertentu."] },
        { id: "biaya", h: "9. Biaya", p: ["[lengkapi: paket, harga, cara pembayaran, dan kebijakan pengembalian dana, atau nyatakan bahwa layanan saat ini gratis]."] },
        { id: "tanggung-jawab", h: "10. Batasan tanggung jawab", p: ["[lengkapi bersama konsultan hukum: batasan tanggung jawab dan ganti rugi yang sesuai hukum Indonesia]."] },
        { id: "pengakhiran", h: "11. Pengakhiran dan ekspor data", p: ["Pelanggan dapat berhenti memakai layanan kapan saja. Sebelum berhenti, Pelanggan dapat mengekspor laporan dan jejak audit dari menu Laporan. [lengkapi: berapa lama data disimpan setelah pengakhiran, dan cara penghapusannya]."] },
        { id: "hukum", h: "12. Hukum yang berlaku", p: ["Ketentuan ini diatur oleh hukum Republik Indonesia. [lengkapi: forum penyelesaian sengketa]."] },
        { id: "perubahan", h: "13. Perubahan ketentuan", p: ["Kami dapat mengubah ketentuan ini. Perubahan penting akan diberitahukan kepada Pemilik organisasi [lengkapi: cara dan jangka waktu pemberitahuan]."] },
      ],
    },
    en: {
      title: "Terms & Conditions",
      lead: "Terms for using the Amanta service.",
      draft: true,
      updated: UPDATED,
      blocks: [
        { id: "para-pihak", h: "1. Parties and acceptance", p: ["The Amanta service is provided by [complete: legal entity name] (\"we\"). By registering a company or using Amanta, you accept these terms on behalf of the company you represent (the \"Customer\"). If you are not authorized to represent that company, do not register."] },
        { id: "layanan", h: "2. The service", p: ["Amanta is software for recording and running food safety and quality workflows: documents, HACCP controls, checklists, CCP monitoring, deviations, CAPA, suppliers, traceability, reports and an audit trail."] },
        { id: "bukan-sertifikasi", h: "3. Not certification and not professional advice", list: [
          "Amanta does not issue, guarantee or replace any certification, including from BPOM, BPJPH or certification bodies.",
          "Templates and AI drafts may be wrong or incomplete. The Customer must have them validated by competent food-safety personnel before use.",
          "Food safety decisions, including product release, hold and recall, remain the Customer's responsibility.",
        ] },
        { id: "akun", h: "4. Accounts and roles", p: ["The organization Owner is responsible for who is invited and which roles they receive. Every user must keep their password confidential and tell their company Admin promptly if they suspect misuse of their account."] },
        { id: "konten", h: "5. Customer data and content", list: [
          "Data and documents uploaded remain the Customer's property.",
          "The Customer grants us a limited permission to store and process that data solely to provide the service.",
          "The Customer warrants that it has the right to upload the content and, where it contains personal data, processes it in line with Law No. 27 of 2022 on Personal Data Protection.",
        ] },
        { id: "ai", h: "6. AI and third-party providers", p: ["AI features send document and deviation content to the AI provider active for the Customer. If the Customer uses its own provider and API key (BYOK), the relationship between the Customer and that provider, including costs, quotas and data processing, is governed by their agreement. We are not responsible for third-party provider services."] },
        { id: "larangan", h: "7. Prohibited use", list: [
          "Attempting to access another company's data or bypass role restrictions.",
          "Uploading malware or unlawful content.",
          "Using the API so heavily that it disrupts the service, or using API keys beyond their granted scopes.",
          "Pointing AI settings at an address that does not belong to a legitimate AI provider.",
        ] },
        { id: "ketersediaan", h: "8. Availability and changes", p: ["[complete: service level (SLA), maintenance windows and how changes are announced]. Without a separate written agreement, the service is provided without any specific availability guarantee."] },
        { id: "biaya", h: "9. Fees", p: ["[complete: plans, prices, payment terms and refund policy, or state that the service is currently free]."] },
        { id: "tanggung-jawab", h: "10. Limitation of liability", p: ["[complete with legal counsel: limitation of liability and indemnities appropriate under Indonesian law]."] },
        { id: "pengakhiran", h: "11. Termination and data export", p: ["The Customer may stop using the service at any time. Before leaving, the Customer can export reports and the audit trail from Reports. [complete: how long data is kept after termination, and how it is deleted]."] },
        { id: "hukum", h: "12. Governing law", p: ["These terms are governed by the laws of the Republic of Indonesia. [complete: dispute resolution forum]."] },
        { id: "perubahan", h: "13. Changes to these terms", p: ["We may change these terms. Material changes will be communicated to organization Owners [complete: method and notice period]."] },
      ],
    },
  },

  "kebijakan-privasi": {
    id: {
      title: "Kebijakan Privasi",
      lead: "Data pribadi apa yang diproses Amanta, untuk apa, dan hak Anda atasnya.",
      draft: true,
      updated: UPDATED,
      blocks: [
        { id: "peran", h: "1. Siapa yang bertanggung jawab", p: [
          "[lengkapi: nama badan usaha] (\"kami\") mengoperasikan Amanta.",
          "Untuk data akun pengguna, kami bertindak sebagai pengendali data pribadi. Untuk data yang diunggah perusahaan Pelanggan ke dalam Amanta (misalnya dokumen dan catatan produksi), perusahaan Pelanggan adalah pengendali, dan kami memprosesnya atas nama mereka.",
        ] },
        { id: "data", h: "2. Data yang kami proses", list: [
          "Data akun: nama, email, peran, dan bahasa pilihan. Kata sandi disimpan sebagai hash, bukan teks asli.",
          "Data keamanan: alamat IP dan waktu login, dipakai untuk membatasi percobaan login dan dicatat di jejak audit.",
          "Data organisasi: nama perusahaan, nama badan usaha, NIB, alamat, provinsi, dan preferensi seperti zona waktu.",
          "Konten Pelanggan: dokumen, kontrol HACCP, checklist, pembacaan CCP, deviasi, CAPA, data pemasok, dan catatan lain yang dimasukkan pengguna. Konten ini bisa memuat data pribadi bila Pelanggan memasukkannya.",
        ] },
        { id: "tujuan", h: "3. Untuk apa data dipakai", list: [
          "Menyediakan layanan: login, pemisahan data antar perusahaan, dan menjalankan fitur yang Anda pakai.",
          "Keamanan: mencegah penyalahgunaan, mengunci akun setelah percobaan login berulang, dan menyimpan jejak audit.",
          "Dukungan: menjawab pertanyaan dan menyelesaikan masalah teknis.",
          "Kami tidak menjual data pribadi dan tidak memakainya untuk iklan.",
        ] },
        { id: "ai", h: "4. AI", p: ["Saat fitur AI dipakai, isi dokumen atau deviasi yang relevan dikirim ke penyedia AI yang aktif untuk perusahaan Anda: AI bawaan server, atau penyedia yang dipilih Admin perusahaan Anda (BYOK). Pemrosesan oleh penyedia tersebut tunduk pada ketentuan penyedia itu. Kami menyarankan perusahaan memiliki perjanjian pemrosesan data dengan penyedia AI yang dipakai."] },
        { id: "cookie", h: "5. Cookie", p: ["Amanta hanya memakai cookie yang diperlukan agar layanan berjalan:"], list: [
          "amanta_session: menjaga Anda tetap login, berlaku sampai 7 hari, tidak bisa dibaca oleh JavaScript.",
          "Cookie singkat (maksimal 2 menit) untuk menampilkan tautan undangan atau API key baru satu kali.",
          "Tidak ada cookie analitik atau iklan.",
        ] },
        { id: "penyimpanan", h: "6. Penyimpanan dan keamanan", p: ["Data disimpan di [lengkapi: penyedia dan lokasi pusat data]. Langkah pengamanannya dijelaskan di halaman Keamanan."] },
        { id: "retensi", h: "7. Berapa lama data disimpan", p: ["Amanta tidak menghapus catatan produksi secara otomatis, karena catatan keamanan pangan sering wajib disimpan untuk jangka waktu tertentu. Jejak audit bersifat permanen. [lengkapi: masa simpan data akun setelah pengguna dinonaktifkan, dan data Pelanggan setelah kontrak berakhir]."] },
        { id: "hak", h: "8. Hak Anda", p: ["Sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi, Anda dapat meminta akses, perbaikan, atau penghapusan data pribadi Anda, serta hak lain yang diatur undang-undang tersebut. Untuk data di dalam akun perusahaan, ajukan permintaan ke Admin perusahaan Anda terlebih dahulu. Untuk hal lain, hubungi [lengkapi: email privasi]. Beberapa catatan, seperti jejak audit, mungkin tidak bisa dihapus karena kewajiban hukum atau kebutuhan pembuktian."] },
        { id: "perubahan", h: "9. Perubahan kebijakan", p: ["Kami akan memperbarui tanggal di atas setiap kali kebijakan ini berubah, dan memberi tahu Pemilik organisasi bila ada perubahan penting."] },
      ],
    },
    en: {
      title: "Privacy Policy",
      lead: "What personal data Amanta processes, why, and your rights over it.",
      draft: true,
      updated: UPDATED,
      blocks: [
        { id: "peran", h: "1. Who is responsible", p: [
          "[complete: legal entity name] (\"we\") operates Amanta.",
          "For user account data, we act as the personal data controller. For data that Customer companies upload into Amanta (for example documents and production records), the Customer company is the controller and we process that data on its behalf.",
        ] },
        { id: "data", h: "2. Data we process", list: [
          "Account data: name, email, role and preferred language. Passwords are stored as hashes, never as plain text.",
          "Security data: IP address and sign-in time, used to rate-limit sign-in attempts and recorded in the audit trail.",
          "Organization data: company name, legal entity name, business ID (NIB), address, province and preferences such as time zone.",
          "Customer content: documents, HACCP controls, checklists, CCP readings, deviations, CAPA, supplier data and other records entered by users. This content may contain personal data if the Customer enters it.",
        ] },
        { id: "tujuan", h: "3. How data is used", list: [
          "To provide the service: sign-in, keeping companies' data separate and running the features you use.",
          "Security: preventing abuse, locking accounts after repeated failed sign-ins and keeping an audit trail.",
          "Support: answering questions and resolving technical issues.",
          "We do not sell personal data and do not use it for advertising.",
        ] },
        { id: "ai", h: "4. AI", p: ["When you use AI features, the relevant document or deviation content is sent to the AI provider active for your company: the server's built-in AI, or the provider chosen by your company Admin (BYOK). Processing by that provider is governed by the provider's terms. We recommend that companies have a data processing agreement with the AI provider they use."] },
        { id: "cookie", h: "5. Cookies", p: ["Amanta only uses cookies that are required for the service to work:"], list: [
          "amanta_session: keeps you signed in for up to 7 days and cannot be read by JavaScript.",
          "Short-lived cookies (2 minutes at most) to show a new invitation link or API key once.",
          "No analytics or advertising cookies.",
        ] },
        { id: "penyimpanan", h: "6. Storage and security", p: ["Data is stored at [complete: hosting provider and data centre location]. Safeguards are described on the Security page."] },
        { id: "retensi", h: "7. How long data is kept", p: ["Amanta does not delete production records automatically, because food safety records often must be kept for a set period. The audit trail is permanent. [complete: how long account data is kept after a user is deactivated, and Customer data after the contract ends]."] },
        { id: "hak", h: "8. Your rights", p: ["Under Law No. 27 of 2022 on Personal Data Protection, you can request access to, correction of or deletion of your personal data, along with the other rights that law provides. For data inside a company account, ask your company Admin first. For anything else, contact [complete: privacy email]. Some records, such as the audit trail, may not be deletable because of legal obligations or evidentiary needs."] },
        { id: "perubahan", h: "9. Changes to this policy", p: ["We will update the date above whenever this policy changes, and notify organization Owners of material changes."] },
      ],
    },
  },
};
