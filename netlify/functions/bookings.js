import { getStore } from "@netlify/blobs";

// ===================== CONFIG =====================
// ศูนย์ฟื้นฟูสมรรถภาพทางด้านวิทยาศาสตร์การกีฬาเคลื่อนที่
// การแข่งขันกีฬามหาวิทยาลัยแห่งประเทศไทย ครั้งที่ 52 รอบคัดเลือก เขตภาคกลาง
// 19-23 ตุลาคม 2569 (2026), เวลา 08:00-20:00

const YEAR = 2026;
const MONTH_INDEX = 9; // October (0-indexed: Jan=0)
const DAY_FROM = 18;
const DAY_TO = 23;
const OPEN_MIN = 8 * 60; // 08:00
const CLOSE_MIN = 20 * 60; // 20:00

const SERVICES = [
  { id: "nuad60", name: "นวดผ่อนคลายทางการกีฬา (60 นาที)", capacity: 4, durationMin: 60, advanceMin: 30 },
  { id: "therapy", name: "เครื่องบำบัดสุญญากาศแรงดันลบ", capacity: 1, durationMin: 30, advanceMin: 0 },
  { id: "coldspray", name: "เครื่องพ่นเย็นเฉพาะจุด", capacity: 1, durationMin: 5, advanceMin: 0 },
  { id: "capsule", name: "แคปซูลออกซิเจนแรงดันสูง", capacity: 1, durationMin: 60, advanceMin: 0 },
  { id: "kinesio", name: "ติดเทป Kinesio Tex", capacity: 4, durationMin: 15, advanceMin: 0 },
];

const SPORT_TYPES = [
  "กีฬาบาสเกตบอล ทีมชาย",
  "กีฬาวอลเลย์บอล ทีมหญิง",
  "กีฬาฟุตซอล ทีมชาย",
  "กีฬาฟุตซอล ทีมหญิง",
  "กีฬาเซปักตะกร้อ ทีมชาย",
  "กีฬาเซปักตะกร้อ ทีมหญิง",
  "กีฬาเปตอง",
];

// ผู้ให้บริการ: วนตามทีมวิทยาศาสตร์การกีฬา (ไม่ระบุชื่อบุคคล แบ่งตามวิทยาเขต ทีมละ 3 คน ไม่นับเจ้าหน้าที่ควบคุม)
const PROVIDER_TEAMS = [
  "ทีมวิทยาศาสตร์การกีฬา วิทยาเขตสุพรรณบุรี",
  "ทีมวิทยาศาสตร์การกีฬา วิทยาเขตสมุทรสาคร",
  "ทีมวิทยาศาสตร์การกีฬา วิทยาเขตชลบุรี",
];

const STATUS_OPTIONS = ["นักกีฬา", "เจ้าหน้าที่"];

function pad2(n) { return String(n).padStart(2, "0"); }

function datesInRange() {
  const out = [];
  for (let d = DAY_FROM; d <= DAY_TO; d++) {
    const dt = new Date(YEAR, MONTH_INDEX, d);
    out.push({
      iso: `${YEAR}-${pad2(MONTH_INDEX + 1)}-${pad2(d)}`,
      day: d,
      label: dt.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" }),
    });
  }
  return out;
}

function minToHHMM(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function slotsForService(svc) {
  const out = [];
  for (let t = OPEN_MIN; t + svc.durationMin <= CLOSE_MIN; t += svc.durationMin) {
    out.push({
      id: `${svc.id}-${t}`,
      startMin: t,
      endMin: t + svc.durationMin,
      label: `${minToHHMM(t)}-${minToHHMM(t + svc.durationMin)}`,
    });
  }
  return out;
}

function findService(id) {
  return SERVICES.find((s) => s.id === id);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}

function errJson(stage, error, status = 500) {
  return json(
    {
      ok: false,
      stage,
      error: error && error.message ? error.message : String(error),
      stack: error && error.stack ? String(error.stack) : undefined,
    },
    status
  );
}

function nowMinutesUntil(dateIso, startMin) {
  // คำนวณจำนวนนาทีนับจาก "ตอนนี้" ถึงเวลาเริ่มของ slot (ใช้เวลาไทย UTC+7)
  const target = new Date(`${dateIso}T00:00:00+07:00`);
  target.setMinutes(target.getMinutes() + startMin);
  const now = new Date();
  return (target.getTime() - now.getTime()) / 60000;
}

function store() {
  return getStore("university-games-bookings");
}

async function listAll() {
  const s = store();
  const keys = [];
  let cursor;
  do {
    const page = await s.list({ prefix: "bk:", cursor });
    for (const b of page.blobs) keys.push(b.key);
    cursor = page.cursor;
  } while (cursor);

  const items = await Promise.all(
    keys.map(async (k) => {
      try {
        return await s.get(k, { type: "json" });
      } catch {
        return null;
      }
    })
  );
  return items.filter(Boolean);
}

function makeKey(dateIso, slotId) {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `bk:${dateIso}:${slotId}:${ts}-${rand}`;
}

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    let body = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }
    const action = body.action || url.searchParams.get("action") || "meta";

    if (action === "meta") {
      return json({
        ok: true,
        services: SERVICES,
        dates: datesInRange(),
        sportTypes: SPORT_TYPES,
        statusOptions: STATUS_OPTIONS,
        openMin: OPEN_MIN,
        closeMin: CLOSE_MIN,
      });
    }

    if (action === "diag") {
      const s = store();
      await s.set("diag:ping", JSON.stringify({ t: Date.now() }));
      const read = await s.get("diag:ping", { type: "json" });
      const all = await listAll();
      return json({ ok: true, blobsWritable: !!read, totalBookings: all.length });
    }

    if (action === "listAll") {
      const all = await listAll();
      return json({ ok: true, bookings: all });
    }

    if (action === "dateCounts") {
      const all = await listAll();
      const counts = {};
      for (const b of all) {
        counts[b.date] = (counts[b.date] || 0) + 1;
      }
      return json({ ok: true, counts });
    }

    if (action === "create") {
      const { date, slotId, serviceId, fields } = body;
      const svc = findService(serviceId);
      if (!svc) return json({ ok: false, err: "invalid_service" }, 400);

      const slots = slotsForService(svc);
      const slot = slots.find((sl) => sl.id === slotId);
      if (!slot) return json({ ok: false, err: "invalid_slot" }, 400);

      const dates = datesInRange();
      if (!dates.find((d) => d.iso === date)) {
        return json({ ok: false, err: "invalid_date" }, 400);
      }

      if (!fields || !fields.name || !fields.status || !fields.sportType || !fields.phone) {
        return json({ ok: false, err: "missing_fields" }, 400);
      }
      if (!STATUS_OPTIONS.includes(fields.status)) {
        return json({ ok: false, err: "invalid_status" }, 400);
      }
      if (!SPORT_TYPES.includes(fields.sportType)) {
        return json({ ok: false, err: "invalid_sport_type" }, 400);
      }

      if (svc.advanceMin > 0) {
        const minsUntil = nowMinutesUntil(date, slot.startMin);
        if (minsUntil < svc.advanceMin) {
          return json(
            { ok: false, err: "too_late", advanceMin: svc.advanceMin },
            409
          );
        }
      }

      const s = store();
      const prefix = `bk:${date}:${slotId}:`;
      const page = await s.list({ prefix });
      const existing = page.blobs.length;

      if (existing >= svc.capacity) {
        return json({ ok: false, err: "slot_full" }, 409);
      }

      const providerTeam = PROVIDER_TEAMS[existing % PROVIDER_TEAMS.length];

      const key = makeKey(date, slotId);
      const record = {
        key,
        date,
        slotId,
        serviceId: svc.id,
        serviceName: svc.name,
        slotLabel: slot.label,
        startMin: slot.startMin,
        endMin: slot.endMin,
        name: fields.name,
        status: fields.status,
        sportType: fields.sportType,
        phone: fields.phone,
        note: fields.note || "",
        providerTeam,
        createdAt: Date.now(),
      };

      await s.set(key, JSON.stringify(record));
      return json({ ok: true, booking: record });
    }

    if (action === "cancel") {
      const { key } = body;
      if (!key) return json({ ok: false, err: "missing_key" }, 400);
      const s = store();
      await s.delete(key);
      return json({ ok: true });
    }

    if (action === "move") {
      const { key, newDate, newSlotId } = body;
      if (!key || !newDate || !newSlotId) {
        return json({ ok: false, err: "missing_fields" }, 400);
      }
      const s = store();
      const existingRecord = await s.get(key, { type: "json" });
      if (!existingRecord) return json({ ok: false, err: "not_found" }, 404);

      const svc = findService(existingRecord.serviceId);
      if (!svc) return json({ ok: false, err: "invalid_service" }, 400);

      const slots = slotsForService(svc);
      const slot = slots.find((sl) => sl.id === newSlotId);
      if (!slot) return json({ ok: false, err: "invalid_slot" }, 400);

      const dates = datesInRange();
      if (!dates.find((d) => d.iso === newDate)) {
        return json({ ok: false, err: "invalid_date" }, 400);
      }

      if (svc.advanceMin > 0) {
        const minsUntil = nowMinutesUntil(newDate, slot.startMin);
        if (minsUntil < svc.advanceMin) {
          return json(
            { ok: false, err: "too_late", advanceMin: svc.advanceMin },
            409
          );
        }
      }

      const newPrefix = `bk:${newDate}:${newSlotId}:`;
      const page = await s.list({ prefix: newPrefix });
      const existingCount = page.blobs.length;
      if (existingCount >= svc.capacity) {
        return json({ ok: false, err: "slot_full" }, 409);
      }

      await s.delete(key);
      const providerTeam = PROVIDER_TEAMS[existingCount % PROVIDER_TEAMS.length];
      const newKey = makeKey(newDate, newSlotId);
      const record = {
        ...existingRecord,
        key: newKey,
        date: newDate,
        slotId: newSlotId,
        slotLabel: slot.label,
        startMin: slot.startMin,
        endMin: slot.endMin,
        providerTeam,
        movedAt: Date.now(),
      };
      await s.set(newKey, JSON.stringify(record));
      return json({ ok: true, booking: record });
    }

    return json({ ok: false, err: "unknown_action" }, 400);
  } catch (error) {
    return errJson("top", error, 500);
  }
};
