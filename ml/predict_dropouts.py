# ml/predict_dropouts.py

import pandas as pd
import pickle
import json
from datetime import datetime, date
from pymongo import MongoClient

# ==============================
# Load trained model
# ==============================
with open("ml/rf_pipeline.pkl", "rb") as f:
    model = pickle.load(f)

# ==============================
# Helpers
# ==============================
def normalize_date(d):
    """Handle both MongoDB datetime and ISO string dates"""
    if isinstance(d, datetime):
        return d.date()
    elif isinstance(d, date):
        return d
    else:
        try:
            return datetime.fromisoformat(str(d).split("T")[0]).date()
        except Exception as e:
            print("⚠️ Date parse failed for:", d, e)
            return None

# ==============================
# Build Attendance Sheet
# ==============================
def build_attendance_sheet(entries):
    normalized_entries = []
    for e in entries:
        date_value = None

        # Prefer "date" if available
        if "date" in e and e["date"]:
            date_value = e["date"]
        # Fallback to "timeIn"
        elif "timeIn" in e and e["timeIn"]:
            date_value = e["timeIn"]

        if date_value is not None:
            e["date"] = normalize_date(date_value)
            normalized_entries.append(e)
        else:
            print("⚠️ Skipping entry with no date or timeIn:", e)

    entries = normalized_entries

    # Days where at least one student was present (exclude holidays)
    valid_days = sorted({e["date"] for e in entries if e["status"].lower() == "present"})
    print(f"Valid days considered: {len(valid_days)}")

    # All unique students
    students = {e["studentId"] for e in entries}
    print(f"Unique students: {len(students)}")

    # Build sheet
    records = []
    for sid in students:
        row = {"SR. NO.": sid, "NAME": f"Student-{sid}"}
        for i, d in enumerate(valid_days, 1):
            present = any(
                e["studentId"] == sid and e["date"] == d and e["status"].lower() == "present"
                for e in entries
            )
            row[str(i)] = "P" if present else "A"
        records.append(row)

    return pd.DataFrame(records)

# ==============================
# Feature Engineering
# ==============================
def preprocess_excel(df):
    days = [c for c in df.columns if str(c).isdigit()]
    if not days:
        print("⚠️ No day columns found in dataframe")
        return pd.DataFrame()

    df_long = df.melt(id_vars=["SR. NO.", "NAME"], value_vars=days,
                      var_name="Day", value_name="Status")
    df_long["Present"] = (df_long["Status"] == "P").astype(int)

    features = []
    for sid, g in df_long.groupby("SR. NO."):
        name = g["NAME"].iloc[0]
        att_pct = g["Present"].mean()

        streak, max_streak, long_streaks = 0, 0, 0
        for v in (1 - g.sort_values("Day")["Present"]):
            if v == 1:
                streak += 1
                max_streak = max(max_streak, streak)
                if streak >= 8:
                    long_streaks += 1
            else:
                streak = 0
        features.append([sid, name, att_pct, max_streak, long_streaks])

    return pd.DataFrame(features, columns=[
        "SR. NO.","NAME","attendance_pct",
        "max_consec_absences","num_long_streaks"
    ])

# ==============================
# Run Predictions
# ==============================
def run_predictions(entries, schoolId, db):
    if not entries:
        print(f"⚠️ No attendance records for {schoolId}")
        return

    print(f"Running predictions for {schoolId} with {len(entries)} records")

    df = build_attendance_sheet(entries)
    features = preprocess_excel(df)

    if features.empty:
        print(f"⚠️ No features generated for {schoolId}, skipping")
        return

    X = features.drop(columns=["SR. NO.","NAME"])
    features["dropout_prob"] = model.predict_proba(X)[:,1]
    features["dropout_pred"] = model.predict(X)

    result = features.to_dict(orient="records")
    for r in result:
        r["schoolId"] = schoolId

    out = db["students"]

    for r in result:
        student_id = r["SR. NO."]

        update_fields = {
            "attendancePercentage": float(r["attendance_pct"] * 100),  # renamed field
            "max_consec_absences": int(r["max_consec_absences"]),
            "num_long_streaks": int(r["num_long_streaks"]),
            "dropoutRisk": float(r["dropout_prob"]),             # renamed field
            "dropout_pred": int(r["dropout_pred"])
        }


        # Update student document in-place
        out.update_one(
            {"_id": student_id},   # assumes studentId == _id in students collection
            {"$set": update_fields}
        )

    print(f"Updated {len(result)} students with predictions for {schoolId}")


# ==============================
# Fetch Data
# ==============================
def fetch_from_mongo(schoolId, db):
    entries = list(db["attendances"].find({"schoolId": schoolId}, {"_id":0}))
    print(f"Fetched {len(entries)} attendance entries for school {schoolId}")
    if entries:
        print("Sample entry:", entries[0])
    return entries

# ==============================
# Main
# ==============================
if __name__ == "__main__":
    client = MongoClient("mongodb+srv://unknownhost2106:Shivam%40123@cluster1.hrqxic9.mongodb.net/SmartAttendanceDB?retryWrites=true&w=majority&appName=Cluster1")
    db = client["SmartAttendanceDB"]   # <-- make sure this matches your Node app DB

    schoolIds = db["attendances"].distinct("schoolId")
    print(f"Found {len(schoolIds)} schools in attendance collection")

    for sid in schoolIds:
        entries = fetch_from_mongo(sid, db)
        if entries:
            run_predictions(entries, sid, db)
