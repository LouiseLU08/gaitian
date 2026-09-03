import hashlib
import json
import os
import re
import secrets
import threading
from datetime import date, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = Path(os.environ.get("DATA_DIR", str(BASE_DIR / "data")))
ROOMS_FILE = DATA_DIR / "rooms.json"

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 6
TIME_STEP_MINUTES = 30
MAX_RANGE_DAYS = 45
MAX_PARTICIPANTS = 20
MAX_CANDIDATES = 60
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "").strip().rstrip("/")

rooms_lock = threading.RLock()
rooms = {}


def minutes_from_str(value):
    m = re.fullmatch(r"(\d{2}):(\d{2})", value)
    if not m:
        raise ValueError("time format")
    hours, minutes = int(m.group(1)), int(m.group(2))
    if hours > 24 or minutes not in (0, 30) or (hours == 24 and minutes != 0):
        raise ValueError("time step")
    return hours * 60 + minutes


def str_from_minutes(value):
    return f"{value // 60:02d}:{value % 60:02d}"


def validate_date_text(value):
    try:
        parsed = date.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("date format") from exc
    return parsed


def interval_length(start_text, end_text):
    return minutes_from_str(end_text) - minutes_from_str(start_text)


def merge_interval_list(intervals):
    clean = []
    for start, end in intervals:
        start_min = minutes_from_str(start)
        end_min = minutes_from_str(end)
        if end_min - start_min >= 30:
            clean.append((start_min, end_min))
    clean.sort()
    merged = []
    for start_min, end_min in clean:
        if merged and start_min <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end_min))
        else:
            merged.append((start_min, end_min))
    return [(str_from_minutes(start), str_from_minutes(end)) for start, end in merged]


def validate_availability(
    availability,
    start_date_text,
    end_date_text,
    day_start_text=None,
    day_end_text=None,
    end_time_text=None,
):
    if not isinstance(availability, list) or len(availability) > 200:
        raise ValueError("availability")
    start_date = validate_date_text(start_date_text)
    end_date = validate_date_text(end_date_text)
    day_start_min = minutes_from_str(day_start_text) if day_start_text else 0
    day_end_min = minutes_from_str(day_end_text) if day_end_text else 24 * 60
    end_time_min = minutes_from_str(end_time_text) if end_time_text else 24 * 60
    if day_end_min <= day_start_min:
        raise ValueError("day window")
    grouped = {}
    for item in availability:
        if not isinstance(item, dict):
            raise ValueError("availability")
        item_date = validate_date_text(item.get("date"))
        if not start_date <= item_date <= end_date:
            raise ValueError("date out of range")
        start = item.get("start")
        end = item.get("end")
        try:
            if interval_length(start, end) < TIME_STEP_MINUTES:
                raise ValueError("interval too short")
            upper_min = day_end_min
            if item_date == end_date and end_time_min < upper_min:
                upper_min = end_time_min
            if minutes_from_str(start) < day_start_min or minutes_from_str(end) > upper_min:
                raise ValueError("time out of range")
        except (TypeError, ValueError) as exc:
            if isinstance(exc, ValueError) and exc.args and exc.args[0] in (
                "time out of range",
                "interval too short",
            ):
                raise
            raise ValueError("interval") from exc
        grouped.setdefault(item["date"], []).append((start, end))
    normalized = []
    for item_date, intervals in grouped.items():
        for start, end in merge_interval_list(intervals):
            normalized.append({"date": item_date, "start": start, "end": end})
    return normalized


def load_rooms():
    global rooms
    if ROOMS_FILE.exists():
        try:
            rooms = json.loads(ROOMS_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            rooms = {}
    else:
        rooms = {}


def save_rooms():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp_file = ROOMS_FILE.with_suffix(".tmp")
    tmp_file.write_text(
        json.dumps(rooms, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    tmp_file.replace(ROOMS_FILE)


def generate_code():
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        if code not in rooms:
            return code


def participant_by_nickname(room, nickname):
    for participant in room.get("participants", []):
        if participant.get("nickname") == nickname:
            return participant
    return None


def filled_participants(room):
    return [p for p in room.get("participants", []) if p.get("filled")]


def all_filled(room):
    filled = filled_participants(room)
    return len(filled) >= room.get("participantCount", 0) and len(
        room.get("participants", [])
    ) == room.get("participantCount", 0)


def participant_availability_by_date(participant):
    result = {}
    for entry in participant.get("availability", []):
        result.setdefault(entry["date"], []).append(
            (entry["start"], entry["end"])
        )
    for item_date in result:
        result[item_date] = merge_interval_list(result[item_date])
    return result


def iter_dates(start_text, end_text):
    current = validate_date_text(start_text)
    end = validate_date_text(end_text)
    while current <= end:
        yield current.isoformat()
        current += timedelta(days=1)


def date_segments(start_text, end_text, participants):
    by_participant = [
        participant_availability_by_date(participant) for participant in participants
    ]
    segments = []
    for item_date in iter_dates(start_text, end_text):
        boundaries = {0, 24 * 60}
        for availability in by_participant:
            for start, end in availability.get(item_date, []):
                boundaries.add(minutes_from_str(start))
                boundaries.add(minutes_from_str(end))
        sorted_bounds = sorted(boundaries)
        for index in range(len(sorted_bounds) - 1):
            seg_start = sorted_bounds[index]
            seg_end = sorted_bounds[index + 1]
            if seg_end <= seg_start:
                continue
            cover = []
            for participant_index, availability in enumerate(by_participant):
                if interval_covers(availability.get(item_date, []), seg_start, seg_end):
                    cover.append(participant_index)
            segments.append(
                {
                    "date": item_date,
                    "start": str_from_minutes(seg_start),
                    "end": str_from_minutes(seg_end),
                    "cover": cover,
                }
            )
    return segments


def interval_covers(intervals, start_min, end_min):
    for start, end in intervals:
        if minutes_from_str(start) <= start_min and end_min <= minutes_from_str(end):
            return True
    return False


def plan_id(prefix, item_date, start, end, names):
    digest = hashlib.sha1(
        f"{item_date}|{start}|{end}|{'|'.join(names)}".encode("utf-8")
    ).hexdigest()[:16]
    return f"{prefix}-{digest}"


def full_overlap_plans(room):
    participants = filled_participants(room)
    if not participants:
        return []
    segments = date_segments(room["startDate"], room["endDate"], participants)
    result = []
    current = None
    for segment in segments:
        if len(segment["cover"]) == len(participants):
            seg_start = minutes_from_str(segment["start"])
            seg_end = minutes_from_str(segment["end"])
            if current and current["date"] == segment["date"] and minutes_from_str(
                current["end"]
            ) == seg_start:
                current["end"] = segment["end"]
                current["minutes"] += seg_end - seg_start
            else:
                current = {
                    "id": "",
                    "date": segment["date"],
                    "start": segment["start"],
                    "end": segment["end"],
                    "minutes": seg_end - seg_start,
                }
                result.append(current)
    names = [p["nickname"] for p in participants]
    for plan in result:
        plan["id"] = plan_id("full", plan["date"], plan["start"], plan["end"], names)
        plan["availableCount"] = len(participants)
        plan["unavailable"] = []
    result.sort(key=lambda plan: (-plan["minutes"], plan["date"], plan["start"]))
    return result


def partial_candidates(room):
    participants = filled_participants(room)
    if not participants:
        return []
    segments = date_segments(room["startDate"], room["endDate"], participants)
    total = len(participants)
    runs = []
    current = None
    for segment in segments:
        cover = tuple(sorted(segment["cover"]))
        if not cover or len(cover) >= total:
            current = None
            continue
        seg_start = minutes_from_str(segment["start"])
        seg_end = minutes_from_str(segment["end"])
        if current and current["cover"] == cover and current["date"] == segment["date"] and (
            minutes_from_str(current["end"]) == seg_start
        ):
            current["end"] = segment["end"]
            current["minutes"] += seg_end - seg_start
        else:
            current = {
                "id": "",
                "date": segment["date"],
                "start": segment["start"],
                "end": segment["end"],
                "cover": cover,
                "minutes": seg_end - seg_start,
            }
            runs.append(current)

    names = [p["nickname"] for p in participants]
    candidates = []
    for run in runs:
        free_names = [names[index] for index in run["cover"]]
        unavailable = [
            name for name in names if name not in set(free_names)
        ]
        run_id = plan_id(
            "part", run["date"], run["start"], run["end"], sorted(free_names)
        )
        candidates.append(
            {
                "id": run_id,
                "date": run["date"],
                "start": run["start"],
                "end": run["end"],
                "minutes": minutes_from_str(run["end"])
                - minutes_from_str(run["start"]),
                "availableCount": len(free_names),
                "free": free_names,
                "unavailable": unavailable,
            }
        )
    candidates.sort(
        key=lambda item: (
            -item["availableCount"],
            -item["minutes"],
            item["date"],
            item["start"],
        )
    )
    return candidates[:MAX_CANDIDATES]


def active_candidate(room):
    if not all_filled(room) or room.get("chosen"):
        return None
    candidates = partial_candidates(room)
    rejected = set(room.get("rejectedCandidateIds", []))
    for candidate in candidates:
        if candidate["id"] not in rejected:
            return candidate
    return None


def set_status(room):
    if room.get("chosen"):
        room["status"] = "scheduled"
        return
    if not all_filled(room):
        room["status"] = "filling"
        return
    if full_overlap_plans(room):
        room["status"] = "deciding"
        return
    room["status"] = "coordinating" if active_candidate(room) else "need_round"


def normalize_room_participant_names(room):
    seen = set()
    kept = []
    for participant in room.get("participants", []):
        nickname = participant.get("nickname", "")
        if not nickname or nickname in seen:
            continue
        seen.add(nickname)
        kept.append(participant)
    room["participants"] = kept


def create_room(payload):
    topic = str(payload.get("topic", "")).strip()
    nickname = str(payload.get("nickname", "")).strip()
    participant_count = payload.get("participantCount")
    start_date = str(payload.get("startDate", "") or date.today().isoformat())
    end_date = str(payload.get("endDate", ""))
    end_time = str(payload.get("endTime", "24:00"))
    if not topic or len(topic) > 80:
        raise ValueError("topic")
    if not nickname or len(nickname) > 20:
        raise ValueError("nickname")
    try:
        count = int(participant_count)
    except (TypeError, ValueError) as exc:
        raise ValueError("participantCount") from exc
    if count < 2 or count > MAX_PARTICIPANTS:
        raise ValueError("participantCount")
    start_parsed = validate_date_text(start_date)
    end_parsed = validate_date_text(end_date)
    if start_parsed > end_parsed:
        raise ValueError("date range")
    if (end_parsed - start_parsed).days + 1 > MAX_RANGE_DAYS:
        raise ValueError("date range too long")
    minutes_from_str(end_time)
    availability = validate_availability(
        payload.get("availability", []),
        start_date,
        end_date,
        end_time_text=end_time,
    )
    if not availability:
        raise ValueError("availability required")
    room = {
        "code": generate_code(),
        "topic": topic,
        "creator": nickname,
        "participantCount": count,
        "startDate": start_date,
        "endDate": end_date,
        "endTime": end_time,
        "round": 1,
        "status": "filling",
        "createdAt": datetime.now().isoformat(timespec="seconds"),
        "participants": [
            {
                "nickname": nickname,
                "isCreator": True,
                "filled": True,
                "availability": availability,
                "updatedAt": datetime.now().isoformat(timespec="seconds"),
            }
        ],
        "chosen": None,
        "rejectedCandidateIds": [],
    }
    with rooms_lock:
        rooms[room["code"]] = room
        save_rooms()
    return room


def respond_to_room(code, payload):
    nickname = str(payload.get("nickname", "")).strip()
    if not nickname or len(nickname) > 20:
        raise ValueError("nickname")
    with rooms_lock:
        room = rooms.get(code)
        if not room:
            raise KeyError("room")
        if room.get("chosen"):
            raise PermissionError("scheduled")
        availability = validate_availability(
            payload.get("availability", []),
            room["startDate"],
            room["endDate"],
            room.get("dayStart"),
            room.get("dayEnd"),
            room.get("endTime"),
        )
        existing = participant_by_nickname(room, nickname)
        if existing is None:
            if len(room.get("participants", [])) >= room["participantCount"]:
                raise LookupError("room_full")
            existing = {
                "nickname": nickname,
                "isCreator": nickname == room["creator"],
                "filled": True,
                "availability": [],
                "updatedAt": "",
            }
            room["participants"].append(existing)
        existing["availability"] = availability
        existing["filled"] = True
        existing["updatedAt"] = datetime.now().isoformat(timespec="seconds")
        room["rejectedCandidateIds"] = []
        set_status(room)
        save_rooms()
        return room


def choose_plan(code, payload):
    nickname = str(payload.get("nickname", "")).strip()
    plan_id_value = str(payload.get("planId", ""))
    with rooms_lock:
        room = rooms.get(code)
        if not room:
            raise KeyError("room")
        if room.get("chosen"):
            raise PermissionError("already scheduled")
        if not all_filled(room):
            raise PermissionError("not ready")
        plans = full_overlap_plans(room)
        selected = next((plan for plan in plans if plan["id"] == plan_id_value), None)
        if selected is None:
            raise LookupError("plan")
        if not participant_by_nickname(room, nickname):
            raise PermissionError("not participant")
        room["chosen"] = {
            "date": selected["date"],
            "start": selected["start"],
            "end": selected["end"],
            "chosenBy": nickname,
            "chosenAt": datetime.now().isoformat(timespec="seconds"),
        }
        room["status"] = "scheduled"
        save_rooms()
        return room


def adjust_for_candidate(code, payload):
    nickname = str(payload.get("nickname", "")).strip()
    plan_id_value = str(payload.get("planId", ""))
    with rooms_lock:
        room = rooms.get(code)
        if not room:
            raise KeyError("room")
        candidate = active_candidate(room)
        if not candidate or candidate["id"] != plan_id_value:
            raise LookupError("candidate")
        if nickname not in candidate["unavailable"]:
            raise PermissionError("not blocker")
        participant = participant_by_nickname(room, nickname)
        if participant is None:
            raise PermissionError("not participant")
        participant.setdefault("availability", []).append(
            {
                "date": candidate["date"],
                "start": candidate["start"],
                "end": candidate["end"],
            }
        )
        participant["availability"] = validate_availability(
            participant["availability"],
            room["startDate"],
            room["endDate"],
            room.get("dayStart"),
            room.get("dayEnd"),
            room.get("endTime"),
        )
        participant["filled"] = True
        participant["updatedAt"] = datetime.now().isoformat(timespec="seconds")
        room["rejectedCandidateIds"] = []
        set_status(room)
        save_rooms()
        return room


def skip_candidate(code, payload):
    nickname = str(payload.get("nickname", "")).strip()
    with rooms_lock:
        room = rooms.get(code)
        if not room:
            raise KeyError("room")
        if room.get("chosen"):
            raise PermissionError("scheduled")
        if not all_filled(room):
            raise PermissionError("not ready")
        candidate = active_candidate(room)
        if not candidate:
            raise LookupError("candidate")
        participant = participant_by_nickname(room, nickname)
        if participant is None:
            raise PermissionError("not participant")
        if nickname != room["creator"] and nickname not in candidate["unavailable"]:
            raise PermissionError("not blocker")
        rejected = room.setdefault("rejectedCandidateIds", [])
        if candidate["id"] not in rejected:
            rejected.append(candidate["id"])
        set_status(room)
        save_rooms()
        return room


def start_new_round(code, payload):
    nickname = str(payload.get("nickname", "")).strip()
    start_date = str(payload.get("startDate", ""))
    end_date = str(payload.get("endDate", ""))
    with rooms_lock:
        room = rooms.get(code)
        if not room:
            raise KeyError("room")
        if nickname != room["creator"]:
            raise PermissionError("not creator")
        end_time = str(payload.get("endTime", room.get("endTime", "24:00")))
        start_parsed = validate_date_text(start_date)
        end_parsed = validate_date_text(end_date)
        if start_parsed > end_parsed:
            raise ValueError("date range")
        if (end_parsed - start_parsed).days + 1 > MAX_RANGE_DAYS:
            raise ValueError("date range too long")
        minutes_from_str(end_time)
        room["startDate"] = start_date
        room["endDate"] = end_date
        room["endTime"] = end_time
        room["round"] = int(room.get("round", 1)) + 1
        room["status"] = "filling"
        room["chosen"] = None
        room["rejectedCandidateIds"] = []
        for participant in room.get("participants", []):
            participant["availability"] = []
            participant["filled"] = False
            participant["updatedAt"] = datetime.now().isoformat(timespec="seconds")
        save_rooms()
        return room


def public_room(room):
    with rooms_lock:
        set_status(room)
        filled = filled_participants(room)
        participants = []
        for participant in room.get("participants", []):
            participants.append(
                {
                    "nickname": participant["nickname"],
                    "isCreator": participant.get("isCreator", False),
                    "filled": participant.get("filled", False),
                    "availability": participant.get("availability", []),
                    "updatedAt": participant.get("updatedAt", ""),
                }
            )
        plans = full_overlap_plans(room) if all_filled(room) else []
        candidates = partial_candidates(room) if all_filled(room) else []
        active = active_candidate(room)
        payload = {
            "code": room["code"],
            "topic": room["topic"],
            "creator": room["creator"],
            "participantCount": room["participantCount"],
            "filledCount": len(filled),
            "startDate": room["startDate"],
            "endDate": room["endDate"],
            "dayStart": room.get("dayStart", "08:00"),
            "dayEnd": room.get("dayEnd", "22:00"),
            "endTime": room.get("endTime", "24:00"),
            "round": room["round"],
            "status": room["status"],
            "createdAt": room.get("createdAt", ""),
            "participants": participants,
            "plans": plans,
            "candidates": candidates,
            "activeCandidate": active,
            "rejectedCount": len(room.get("rejectedCandidateIds", [])),
            "chosen": room.get("chosen"),
        }
        return payload


class Handler(BaseHTTPRequestHandler):
    server_version = "Yueshijian/1.0"

    def log_message(self, format_string, *args):
        pass

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("request") from exc
        if length <= 0 or length > 1024 * 1024:
            raise ValueError("request")
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ValueError("request") from exc

    def send_static(self, path):
        if path in ("/", "/index.html"):
            path = "/index.html"
        elif path.startswith("/r/") or not path.startswith("/"):
            path = "/index.html"
        try:
            relative = Path(path[1:])
            full_path = (STATIC_DIR / relative).resolve()
            full_path.relative_to(STATIC_DIR.resolve())
        except (ValueError, OSError):
            self.send_error(404)
            return
        if not full_path.is_file():
            full_path = STATIC_DIR / "index.html"
        try:
            body = full_path.read_bytes()
        except OSError:
            self.send_error(404)
            return
        content_types = {
            ".html": "text/html; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".ico": "image/x-icon",
        }
        self.send_response(200)
        self.send_header(
            "Content-Type",
            content_types.get(full_path.suffix.lower(), "application/octet-stream"),
        )
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def handle_api_error(self, exc):
        if isinstance(exc, KeyError):
            self.send_json(404, {"error": "房间不存在或已失效", "code": "not_found"})
        elif isinstance(exc, LookupError):
            if exc.args and exc.args[0] == "room_full":
                self.send_json(409, {"error": "人数已满", "code": "room_full"})
            else:
                self.send_json(404, {"error": "请求的方案不存在", "code": "not_found"})
        elif isinstance(exc, PermissionError):
            messages = {
                "scheduled": "时间已确定，不能继续修改",
                "not ready": "还有人没有填写，暂不能计算",
                "not participant": "请先使用自己的昵称加入",
                "not creator": "只有发起人可以发起新一轮",
                "not blocker": "该时段没有排除你的时间",
                "already scheduled": "时间已经确定",
            }
            message = messages.get(exc.args[0] if exc.args else "", "操作不允许")
            self.send_json(403, {"error": message, "code": "forbidden"})
        elif isinstance(exc, ValueError):
            messages = {
                "topic": "请填写约定主题（80 字以内）",
                "nickname": "昵称不能为空且不超过 20 字",
                "participantCount": "人数需为 2 到 20",
                "date range": "结束日期不能早于开始日期",
                "date range too long": "可约日期最多 45 天",
                "date format": "日期格式不正确",
                "availability": "空闲时间格式不正确",
                "date out of range": "空闲时间超出了可约日期",
                "interval too short": "空闲时间最短 30 分钟",
                "interval": "时间格式不正确，需按 30 分钟对齐",
                "day window": "每天可约时间的结束需要晚于开始",
                "time out of range": "空闲时间超出了 DDL 时间",
                "availability required": "请先在日历中选择自己的空闲时间",
                "request": "请求内容不正确",
            }
            message = messages.get(exc.args[0] if exc.args else "", "请求参数有误")
            self.send_json(400, {"error": message, "code": "bad_request"})
        else:
            self.send_json(500, {"error": "服务器暂时开小差了", "code": "server_error"})

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/api/"):
            try:
                if path == "/api/health":
                    self.send_json(200, {"ok": True})
                    return
                if path == "/api/config":
                    self.send_json(200, {"publicBaseUrl": PUBLIC_BASE_URL})
                    return
                match = re.fullmatch(r"/api/room/([A-Z0-9]+)", path)
                if match:
                    code = match.group(1)
                    with rooms_lock:
                        room = rooms.get(code)
                        if not room:
                            raise KeyError("room")
                        self.send_json(200, public_room(room))
                    return
                self.send_json(404, {"error": "接口不存在", "code": "not_found"})
            except Exception as exc:  # noqa: BLE001
                self.handle_api_error(exc)
            return
        self.send_static(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if not path.startswith("/api/"):
            self.send_json(404, {"error": "接口不存在", "code": "not_found"})
            return
        try:
            payload = self.read_json()
            if path == "/api/rooms":
                room = create_room(payload)
                self.send_json(200, public_room(room))
                return
            match = re.fullmatch(r"/api/room/([A-Z0-9]+)/([a-z_]+)", path)
            if not match:
                self.send_json(404, {"error": "接口不存在", "code": "not_found"})
                return
            code, action = match.group(1), match.group(2)
            actions = {
                "respond": respond_to_room,
                "choose": choose_plan,
                "adjust": adjust_for_candidate,
                "skip": skip_candidate,
                "new_round": start_new_round,
            }
            if action not in actions:
                self.send_json(404, {"error": "接口不存在", "code": "not_found"})
                return
            room = actions[action](code, payload)
            self.send_json(200, public_room(room))
        except Exception as exc:  # noqa: BLE001
            self.handle_api_error(exc)


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    load_rooms()
    port = int(os.environ.get("PORT", "8765"))
    host = os.environ.get("HOST", "0.0.0.0")
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"约时间工具已启动：http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
