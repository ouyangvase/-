export const supportedLocales = ["zh-CN", "en", "ms", "th", "vi", "id"] as const;
export type Locale = typeof supportedLocales[number];

export const localeLabels: Record<Locale, string> = {
  "zh-CN": "简体中文",
  en: "English",
  ms: "Bahasa Melayu",
  th: "ไทย",
  vi: "Tiếng Việt",
  id: "Bahasa Indonesia"
};

const englishMessages = {
  "nav.hall": "Hall",
  "nav.wallet": "Wallet",
  "nav.chat": "Chat",
  "nav.profile": "Me",
  "hall.title": "Game Hall",
  "hall.announcements": "Latest announcements",
  "hall.games": "All games",
  "hall.gameCount": "{count} game",
  "hall.rules": "How to play",
  "wallet.title": "My Wallet",
  "wallet.total": "Total balance",
  "wallet.cash": "Cash balance",
  "wallet.game": "Game balance",
  "wallet.topUp": "Top up",
  "wallet.withdraw": "Withdraw",
  "wallet.ledger": "Transaction history",
  "wallet.empty": "No transactions yet",
  "chat.title": "My Chat",
  "chat.search": "Search",
  "chat.noRooms": "No rooms yet",
  "chat.pinned": "Pinned message",
  "chat.participantOnly": "Only round participants can open this packet",
  "chat.spectator": "You are watching this round",
  "profile.title": "My Account",
  "profile.daysJoined": "Days joined",
  "profile.gamesPlayed": "Games played",
  "profile.referral": "My referrals",
  "profile.funds": "Transaction history",
  "profile.settings": "Settings",
  "settings.title": "Settings",
  "settings.profile": "Personal profile",
  "settings.security": "Account security",
  "settings.payment": "Payment settings",
  "settings.general": "General settings",
  "settings.sharedAccount": "Shared account",
  "settings.support": "Contact support",
  "settings.terms": "Terms of service",
  "settings.privacy": "Privacy policy",
  "settings.language": "Language",
  "verification.title": "Identity verification",
  "verification.pending": "Identity verification is under review",
  "verification.pendingBody": "Your submission is being reviewed. Wallet and chat will unlock after approval.",
  "verification.approved": "Identity verified",
  "verification.submit": "Submit verification",
  "verification.legalName": "Legal name",
  "verification.tngAccount": "TNG eWallet account number",
  "game.betting.opened": "Betting is open for {durationSeconds} seconds. Range: {minBet}–{maxBet}.",
  "game.betting.closed": "Betting closed",
  "game.banker.started": "Banker bidding started",
  "game.banker.confirmed": "Banker confirmed: {banker}",
  "game.packet.ready": "Your internal packet is ready",
  "game.packet.claimed": "Packet opened: RM {amount}",
  "game.packet.expired": "Packet expired; the system opened it automatically",
  "game.results.published": "Round results published",
  "game.continue": "Reply 1 to continue as banker or 0 to finish",
  "game.roundWaiting": "Waiting for the next round",
  "game.invalidBet": "This bet cannot be accepted",
  "referral.direct": "Direct members {rate}% cashback",
  "referral.secondLevel": "Second-level members {rate}% cashback",
  "referral.selfGame": "Your own game reward {rate}% cashback",
  "referral.daily": "Today's commission",
  "leaderboard.points": "Points leaderboard",
  "leaderboard.cards": "Cards leaderboard",
  "leaderboard.banker": "Banker leaderboard",
  "rewards.title": "Daily rewards",
  "rewards.cards": "Card rewards",
  "rewards.banker": "Banker rewards",
  "rewards.special": "Special rewards",
  "bot.welcome": "Welcome to PROJECT 12\n\nOpen the Mini App to enter the game hall.",
  "bot.open": "Open game hall",
  "bot.wallet": "Wallet balance and ledger are available in the Mini App.",
  "bot.history": "Round history is recorded by server events and ledger reference IDs.",
  "bot.missions": "Mission rewards are Demo credits and cannot be exchanged for cash.",
  "bot.referral": "Referral binding is confirmed inside the Mini App and cannot be changed later.",
  "bot.rules": "Review the current rules and hand examples before entering a round.",
  "bot.support": "Support is available inside the Mini App.",
  "bot.fallback": "Use /start to open the Mini App.",
  "bot.verificationApproved": "Your identity verification has been approved. Wallet and chat are now available.",
  "common.back": "Back",
  "common.confirm": "Confirm",
  "common.cancel": "Cancel",
  "common.loading": "Loading",
  "common.copy": "Copy",
  "common.saved": "Saved"
} as const;

export type TranslationKey = keyof typeof englishMessages;
type Messages = Partial<Record<TranslationKey, string>>;

const messages: Record<Locale, Messages> = {
  en: englishMessages,
  "zh-CN": {
    "nav.hall": "大厅", "nav.wallet": "钱包", "nav.chat": "聊天", "nav.profile": "我",
    "hall.title": "游戏大厅", "hall.announcements": "最新公告", "hall.games": "所有游戏", "hall.gameCount": "{count}款游戏", "hall.rules": "玩法介绍",
    "wallet.title": "我的钱包", "wallet.total": "总余额", "wallet.cash": "现金余额", "wallet.game": "游戏余额", "wallet.topUp": "充值", "wallet.withdraw": "提现", "wallet.ledger": "资金明细", "wallet.empty": "暂无交易记录",
    "chat.title": "我的聊天", "chat.search": "搜索", "chat.noRooms": "暂无聊天室", "chat.pinned": "置顶消息", "chat.participantOnly": "只有本局参与者可以开红包", "chat.spectator": "你正在旁观本局",
    "profile.title": "我的账号", "profile.daysJoined": "已加入（天）", "profile.gamesPlayed": "累计游戏（局）", "profile.referral": "我的推广", "profile.funds": "资金明细", "profile.settings": "设置",
    "settings.title": "设置", "settings.profile": "个人资料", "settings.security": "账号安全", "settings.payment": "支付设置", "settings.general": "通用设置", "settings.sharedAccount": "共享账号", "settings.support": "联系客服", "settings.terms": "用户协议", "settings.privacy": "隐私政策", "settings.language": "语言",
    "verification.title": "实名认证", "verification.pending": "实名认证审核中", "verification.pendingBody": "您的资料正在审核，审核通过后钱包和聊天功能将解锁。", "verification.approved": "实名认证已通过", "verification.submit": "提交认证", "verification.legalName": "真实姓名", "verification.tngAccount": "TNG eWallet 账号",
    "game.betting.opened": "开始下注，限时 {durationSeconds} 秒。下注范围：{minBet}–{maxBet}。", "game.betting.closed": "下注结束", "game.banker.started": "开始抢庄", "game.banker.confirmed": "庄家已确认：{banker}", "game.packet.ready": "您的内部红包已准备好", "game.packet.claimed": "已开红包：RM {amount}", "game.packet.expired": "红包已过期，系统已自动开包", "game.results.published": "本局成绩已公布", "game.continue": "回复 1 继续做庄，回复 0 结束本桌", "game.roundWaiting": "等待下一局", "game.invalidBet": "本次下注无法接受",
    "referral.direct": "直属下线 {rate}% 返水", "referral.secondLevel": "下线会员（二级）{rate}% 返水", "referral.selfGame": "自身游戏奖励 {rate}% 返水", "referral.daily": "当日佣金", "leaderboard.points": "积分排行榜", "leaderboard.cards": "棋牌排行榜", "leaderboard.banker": "打庄排行榜", "rewards.title": "每日奖励", "rewards.cards": "棋牌奖励", "rewards.banker": "庄家奖励", "rewards.special": "特别奖励",
    "bot.welcome": "欢迎来到 12牛牛\n\n点击下方按钮打开小程序进入游戏大厅。", "bot.open": "进入游戏大厅", "bot.wallet": "请在小程序内查看钱包余额和资金明细。", "bot.history": "回合记录以服务器事件和账本 Reference ID 为准。", "bot.missions": "任务奖励仅为 Demo 积分，不能兑换现金。", "bot.referral": "邀请关系需要在小程序内确认，绑定后不能自行更换。", "bot.rules": "进入回合前请先确认当前规则和牌型示例。", "bot.support": "请在小程序内联系客服。", "bot.fallback": "请使用 /start 打开小程序。", "bot.verificationApproved": "您的实名认证已通过，现在可以使用钱包和聊天功能了。", "common.back": "返回", "common.confirm": "确认", "common.cancel": "取消", "common.loading": "加载中", "common.copy": "复制", "common.saved": "已保存"
  },
  ms: {
    "nav.hall": "Lobi", "nav.wallet": "Dompet", "nav.chat": "Sembang", "nav.profile": "Saya", "hall.title": "Lobi Permainan", "hall.announcements": "Pengumuman terkini", "hall.games": "Semua permainan", "hall.gameCount": "{count} permainan", "hall.rules": "Cara bermain", "wallet.title": "Dompet saya", "wallet.total": "Jumlah baki", "wallet.cash": "Baki tunai", "wallet.game": "Baki permainan", "wallet.topUp": "Tambah nilai", "wallet.withdraw": "Keluarkan", "wallet.ledger": "Sejarah transaksi", "wallet.empty": "Tiada transaksi lagi", "chat.title": "Sembang saya", "chat.search": "Cari", "chat.noRooms": "Tiada bilik lagi", "chat.pinned": "Mesej disemat", "chat.participantOnly": "Hanya peserta pusingan boleh membuka sampul ini", "chat.spectator": "Anda sedang menonton pusingan ini", "profile.title": "Akaun saya", "profile.daysJoined": "Hari disertai", "profile.gamesPlayed": "Permainan dimainkan", "profile.referral": "Rujukan saya", "profile.funds": "Sejarah transaksi", "profile.settings": "Tetapan", "settings.title": "Tetapan", "settings.profile": "Profil peribadi", "settings.security": "Keselamatan akaun", "settings.payment": "Tetapan bayaran", "settings.general": "Tetapan umum", "settings.sharedAccount": "Akaun kongsi", "settings.support": "Hubungi sokongan", "settings.terms": "Syarat perkhidmatan", "settings.privacy": "Dasar privasi", "settings.language": "Bahasa", "verification.title": "Pengesahan identiti", "verification.pending": "Pengesahan identiti sedang disemak", "verification.pendingBody": "Penyerahan anda sedang disemak. Dompet dan sembang akan dibuka selepas diluluskan.", "verification.approved": "Identiti disahkan", "verification.submit": "Hantar pengesahan", "verification.legalName": "Nama sah", "verification.tngAccount": "Nombor akaun TNG eWallet", "game.betting.opened": "Pertaruhan dibuka selama {durationSeconds} saat. Julat: {minBet}–{maxBet}.", "game.betting.closed": "Pertaruhan ditutup", "game.banker.started": "Bidaan banker bermula", "game.banker.confirmed": "Banker disahkan: {banker}", "game.packet.ready": "Sampul dalaman anda sudah tersedia", "game.packet.claimed": "Sampul dibuka: RM {amount}", "game.packet.expired": "Sampul tamat; sistem membukanya secara automatik", "game.results.published": "Keputusan pusingan diterbitkan", "game.continue": "Balas 1 untuk terus menjadi banker atau 0 untuk tamat", "game.roundWaiting": "Menunggu pusingan seterusnya", "game.invalidBet": "Pertaruhan ini tidak dapat diterima", "referral.direct": "Ahli langsung {rate}% pulangan", "referral.secondLevel": "Ahli tahap kedua {rate}% pulangan", "referral.selfGame": "Ganjaran permainan sendiri {rate}% pulangan", "referral.daily": "Komisen hari ini", "leaderboard.points": "Papan mata", "leaderboard.cards": "Papan kad", "leaderboard.banker": "Papan banker", "rewards.title": "Ganjaran harian", "rewards.cards": "Ganjaran kad", "rewards.banker": "Ganjaran banker", "rewards.special": "Ganjaran khas", "bot.welcome": "Selamat datang ke PROJECT 12\n\nBuka Mini App untuk memasuki lobi permainan.", "bot.open": "Buka lobi permainan", "bot.wallet": "Semak baki dan sejarah transaksi dalam Mini App.", "bot.history": "Sejarah pusingan direkodkan oleh peristiwa pelayan dan ID lejar.", "bot.missions": "Ganjaran misi ialah kredit Demo dan tidak boleh ditukar kepada wang tunai.", "bot.referral": "Pautan rujukan disahkan dalam Mini App dan tidak boleh diubah kemudian.", "bot.rules": "Semak peraturan dan contoh tangan sebelum menyertai pusingan.", "bot.support": "Hubungi sokongan dalam Mini App.", "bot.fallback": "Gunakan /start untuk membuka Mini App.", "bot.verificationApproved": "Pengesahan identiti anda telah diluluskan. Dompet dan sembang kini tersedia.", "common.back": "Kembali", "common.confirm": "Sahkan", "common.cancel": "Batal", "common.loading": "Memuatkan", "common.copy": "Salin", "common.saved": "Disimpan"
  },
  th: {
    "nav.hall": "ล็อบบี้", "nav.wallet": "กระเป๋าเงิน", "nav.chat": "แชท", "nav.profile": "ฉัน", "hall.title": "ล็อบบี้เกม", "hall.announcements": "ประกาศล่าสุด", "hall.games": "เกมทั้งหมด", "hall.gameCount": "{count} เกม", "hall.rules": "วิธีเล่น", "wallet.title": "กระเป๋าเงินของฉัน", "wallet.total": "ยอดรวม", "wallet.cash": "ยอดเงินสด", "wallet.game": "ยอดเกม", "wallet.topUp": "เติมเงิน", "wallet.withdraw": "ถอนเงิน", "wallet.ledger": "ประวัติรายการ", "wallet.empty": "ยังไม่มีรายการ", "chat.title": "แชทของฉัน", "chat.search": "ค้นหา", "chat.noRooms": "ยังไม่มีห้อง", "chat.pinned": "ข้อความปักหมุด", "chat.participantOnly": "เฉพาะผู้เข้าร่วมรอบนี้เท่านั้นที่เปิดซองได้", "chat.spectator": "คุณกำลังดูรอบนี้", "profile.title": "บัญชีของฉัน", "profile.daysJoined": "วันที่เข้าร่วม", "profile.gamesPlayed": "เกมที่เล่น", "profile.referral": "การแนะนำของฉัน", "profile.funds": "ประวัติรายการ", "profile.settings": "ตั้งค่า", "settings.title": "ตั้งค่า", "settings.profile": "ข้อมูลส่วนตัว", "settings.security": "ความปลอดภัยบัญชี", "settings.payment": "ตั้งค่าการชำระเงิน", "settings.general": "ตั้งค่าทั่วไป", "settings.sharedAccount": "บัญชีร่วม", "settings.support": "ติดต่อฝ่ายบริการ", "settings.terms": "ข้อกำหนดการใช้บริการ", "settings.privacy": "นโยบายความเป็นส่วนตัว", "settings.language": "ภาษา", "verification.title": "ยืนยันตัวตน", "verification.pending": "กำลังตรวจสอบการยืนยันตัวตน", "verification.pendingBody": "กำลังตรวจสอบข้อมูลของคุณ กระเป๋าเงินและแชทจะเปิดหลังได้รับอนุมัติ", "verification.approved": "ยืนยันตัวตนแล้ว", "verification.submit": "ส่งการยืนยัน", "verification.legalName": "ชื่อจริง", "verification.tngAccount": "หมายเลขบัญชี TNG eWallet", "game.betting.opened": "เปิดเดิมพัน {durationSeconds} วินาที ช่วงเดิมพัน: {minBet}–{maxBet}", "game.betting.closed": "ปิดการเดิมพัน", "game.banker.started": "เริ่มประมูลเจ้ามือ", "game.banker.confirmed": "ยืนยันเจ้ามือ: {banker}", "game.packet.ready": "ซองภายในของคุณพร้อมแล้ว", "game.packet.claimed": "เปิดซองแล้ว: RM {amount}", "game.packet.expired": "ซองหมดเวลา ระบบเปิดให้อัตโนมัติ", "game.results.published": "ประกาศผลรอบแล้ว", "game.continue": "ตอบ 1 เพื่อเป็นเจ้ามือต่อ หรือ 0 เพื่อจบโต๊ะ", "game.roundWaiting": "รอรอบถัดไป", "game.invalidBet": "ไม่สามารถรับเดิมพันนี้ได้", "referral.direct": "สมาชิกโดยตรงคืน {rate}%", "referral.secondLevel": "สมาชิกระดับสองคืน {rate}%", "referral.selfGame": "รางวัลเกมของคุณคืน {rate}%", "referral.daily": "คอมมิชชันวันนี้", "leaderboard.points": "อันดับคะแนน", "leaderboard.cards": "อันดับไพ่", "leaderboard.banker": "อันดับเจ้ามือ", "rewards.title": "รางวัลประจำวัน", "rewards.cards": "รางวัลไพ่", "rewards.banker": "รางวัลเจ้ามือ", "rewards.special": "รางวัลพิเศษ", "bot.welcome": "ยินดีต้อนรับสู่ PROJECT 12\n\nเปิด Mini App เพื่อเข้าสู่ล็อบบี้เกม", "bot.open": "เปิดล็อบบี้เกม", "bot.verificationApproved": "การยืนยันตัวตนของคุณผ่านแล้ว ตอนนี้ใช้กระเป๋าเงินและแชทได้", "common.back": "ย้อนกลับ", "common.confirm": "ยืนยัน", "common.cancel": "ยกเลิก", "common.loading": "กำลังโหลด", "common.copy": "คัดลอก", "common.saved": "บันทึกแล้ว"
  },
  vi: {
    "nav.hall": "Sảnh", "nav.wallet": "Ví", "nav.chat": "Trò chuyện", "nav.profile": "Tôi", "hall.title": "Sảnh trò chơi", "hall.announcements": "Thông báo mới nhất", "hall.games": "Tất cả trò chơi", "hall.gameCount": "{count} trò chơi", "hall.rules": "Cách chơi", "wallet.title": "Ví của tôi", "wallet.total": "Tổng số dư", "wallet.cash": "Số dư tiền mặt", "wallet.game": "Số dư trò chơi", "wallet.topUp": "Nạp tiền", "wallet.withdraw": "Rút tiền", "wallet.ledger": "Lịch sử giao dịch", "wallet.empty": "Chưa có giao dịch", "chat.title": "Trò chuyện của tôi", "chat.search": "Tìm kiếm", "chat.noRooms": "Chưa có phòng", "chat.pinned": "Tin nhắn ghim", "chat.participantOnly": "Chỉ người tham gia ván này mới mở được bao lì xì", "chat.spectator": "Bạn đang xem ván này", "profile.title": "Tài khoản của tôi", "profile.daysJoined": "Ngày tham gia", "profile.gamesPlayed": "Ván đã chơi", "profile.referral": "Giới thiệu của tôi", "profile.funds": "Lịch sử giao dịch", "profile.settings": "Cài đặt", "settings.title": "Cài đặt", "settings.profile": "Thông tin cá nhân", "settings.security": "Bảo mật tài khoản", "settings.payment": "Cài đặt thanh toán", "settings.general": "Cài đặt chung", "settings.sharedAccount": "Tài khoản dùng chung", "settings.support": "Liên hệ hỗ trợ", "settings.terms": "Điều khoản dịch vụ", "settings.privacy": "Chính sách riêng tư", "settings.language": "Ngôn ngữ", "verification.title": "Xác minh danh tính", "verification.pending": "Đang xét duyệt xác minh danh tính", "verification.pendingBody": "Thông tin của bạn đang được xét duyệt. Ví và trò chuyện sẽ mở sau khi được duyệt.", "verification.approved": "Đã xác minh danh tính", "verification.submit": "Gửi xác minh", "verification.legalName": "Họ tên thật", "verification.tngAccount": "Số tài khoản TNG eWallet", "game.betting.opened": "Mở cược trong {durationSeconds} giây. Phạm vi: {minBet}–{maxBet}.", "game.betting.closed": "Đã đóng cược", "game.banker.started": "Bắt đầu đấu giá banker", "game.banker.confirmed": "Đã xác nhận banker: {banker}", "game.packet.ready": "Bao lì xì nội bộ của bạn đã sẵn sàng", "game.packet.claimed": "Đã mở bao: RM {amount}", "game.packet.expired": "Bao đã hết hạn; hệ thống đã tự động mở", "game.results.published": "Đã công bố kết quả ván", "game.continue": "Trả lời 1 để tiếp tục làm banker hoặc 0 để kết thúc", "game.roundWaiting": "Đang chờ ván tiếp theo", "game.invalidBet": "Không thể nhận cược này", "referral.direct": "Thành viên trực tiếp hoàn {rate}%", "referral.secondLevel": "Thành viên cấp hai hoàn {rate}%", "referral.selfGame": "Thưởng trò chơi của bạn hoàn {rate}%", "referral.daily": "Hoa hồng hôm nay", "leaderboard.points": "Bảng xếp hạng điểm", "leaderboard.cards": "Bảng xếp hạng bài", "leaderboard.banker": "Bảng xếp hạng banker", "rewards.title": "Phần thưởng hàng ngày", "rewards.cards": "Thưởng bài", "rewards.banker": "Thưởng banker", "rewards.special": "Thưởng đặc biệt", "bot.welcome": "Chào mừng đến PROJECT 12\n\nMở Mini App để vào sảnh trò chơi.", "bot.open": "Mở sảnh trò chơi", "bot.verificationApproved": "Xác minh danh tính đã được duyệt. Ví và trò chuyện hiện đã dùng được.", "common.back": "Quay lại", "common.confirm": "Xác nhận", "common.cancel": "Hủy", "common.loading": "Đang tải", "common.copy": "Sao chép", "common.saved": "Đã lưu"
  },
  id: {
    "nav.hall": "Lobi", "nav.wallet": "Dompet", "nav.chat": "Obrolan", "nav.profile": "Saya", "hall.title": "Lobi permainan", "hall.announcements": "Pengumuman terbaru", "hall.games": "Semua permainan", "hall.gameCount": "{count} permainan", "hall.rules": "Cara bermain", "wallet.title": "Dompet saya", "wallet.total": "Total saldo", "wallet.cash": "Saldo tunai", "wallet.game": "Saldo permainan", "wallet.topUp": "Isi saldo", "wallet.withdraw": "Tarik", "wallet.ledger": "Riwayat transaksi", "wallet.empty": "Belum ada transaksi", "chat.title": "Obrolan saya", "chat.search": "Cari", "chat.noRooms": "Belum ada ruang", "chat.pinned": "Pesan disematkan", "chat.participantOnly": "Hanya peserta ronde ini yang dapat membuka paket", "chat.spectator": "Anda sedang menonton ronde ini", "profile.title": "Akun saya", "profile.daysJoined": "Hari bergabung", "profile.gamesPlayed": "Permainan dimainkan", "profile.referral": "Referensi saya", "profile.funds": "Riwayat transaksi", "profile.settings": "Pengaturan", "settings.title": "Pengaturan", "settings.profile": "Profil pribadi", "settings.security": "Keamanan akun", "settings.payment": "Pengaturan pembayaran", "settings.general": "Pengaturan umum", "settings.sharedAccount": "Akun bersama", "settings.support": "Hubungi dukungan", "settings.terms": "Ketentuan layanan", "settings.privacy": "Kebijakan privasi", "settings.language": "Bahasa", "verification.title": "Verifikasi identitas", "verification.pending": "Verifikasi identitas sedang ditinjau", "verification.pendingBody": "Pengajuan Anda sedang ditinjau. Dompet dan obrolan akan terbuka setelah disetujui.", "verification.approved": "Identitas terverifikasi", "verification.submit": "Kirim verifikasi", "verification.legalName": "Nama resmi", "verification.tngAccount": "Nomor akun TNG eWallet", "game.betting.opened": "Taruhan dibuka selama {durationSeconds} detik. Rentang: {minBet}–{maxBet}.", "game.betting.closed": "Taruhan ditutup", "game.banker.started": "Penawaran banker dimulai", "game.banker.confirmed": "Banker dikonfirmasi: {banker}", "game.packet.ready": "Paket internal Anda siap", "game.packet.claimed": "Paket dibuka: RM {amount}", "game.packet.expired": "Paket kedaluwarsa; sistem membukanya otomatis", "game.results.published": "Hasil ronde diterbitkan", "game.continue": "Balas 1 untuk lanjut sebagai banker atau 0 untuk selesai", "game.roundWaiting": "Menunggu ronde berikutnya", "game.invalidBet": "Taruhan ini tidak dapat diterima", "referral.direct": "Anggota langsung cashback {rate}%", "referral.secondLevel": "Anggota tingkat dua cashback {rate}%", "referral.selfGame": "Hadiah permainan sendiri cashback {rate}%", "referral.daily": "Komisi hari ini", "leaderboard.points": "Papan peringkat poin", "leaderboard.cards": "Papan peringkat kartu", "leaderboard.banker": "Papan peringkat banker", "rewards.title": "Hadiah harian", "rewards.cards": "Hadiah kartu", "rewards.banker": "Hadiah banker", "rewards.special": "Hadiah khusus", "bot.welcome": "Selamat datang di PROJECT 12\n\nBuka Mini App untuk masuk ke lobi permainan.", "bot.open": "Buka lobi permainan", "bot.verificationApproved": "Verifikasi identitas Anda telah disetujui. Dompet dan obrolan kini tersedia.", "common.back": "Kembali", "common.confirm": "Konfirmasi", "common.cancel": "Batal", "common.loading": "Memuat", "common.copy": "Salin", "common.saved": "Tersimpan"
  }
};

const localeAliases: Record<string, Locale> = {
  zh: "zh-CN", "zh-cn": "zh-CN", "zh-hans": "zh-CN", "zh-sg": "zh-CN", "zh-my": "zh-CN",
  en: "en", "en-us": "en", "en-gb": "en", ms: "ms", "ms-my": "ms", id: "id", "id-id": "id", th: "th", "th-th": "th", vi: "vi", "vi-vn": "vi"
};

export function normalizeLocale(value: string | null | undefined): Locale | undefined {
  if (!value) return undefined;
  return localeAliases[value.toLowerCase()] ?? supportedLocales.find((locale) => locale.toLowerCase() === value.toLowerCase());
}

export function resolveLocale(preferred: string | null | undefined, telegramLanguageCode?: string | null, fallback: Locale = "en"): Locale {
  return normalizeLocale(preferred) ?? normalizeLocale(telegramLanguageCode) ?? fallback;
}

export function translate(locale: Locale, key: TranslationKey, values: Record<string, string | number> = {}): string {
  const template = messages[locale][key] ?? messages.en[key] ?? key;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, name: string) => String(values[name] ?? `{${name}}`));
}

export function createTranslator(locale: Locale) {
  return (key: TranslationKey, values?: Record<string, string | number>) => translate(locale, key, values);
}

export function formatMoney(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export function formatNumber(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount);
}

export function formatDateTime(value: string | number | Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export const localeStorageKey = "project12_locale";
