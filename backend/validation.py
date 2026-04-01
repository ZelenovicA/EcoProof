import pandas as pd
import numpy as np
from datetime import datetime
from sklearn.cluster import DBSCAN
from sklearn.ensemble import IsolationForest
from sqlalchemy.orm import Session
from database import SessionLocal, engine
from models import HourlyValidation, RejectionReason

def run_hourly_validation():
    print("Starting hourly validation...\n")
    db: Session = SessionLocal()

    query = """
        SELECT 
            sd.sensor_id, s.lat, s.lon, sd.pm25, sd.pm10, sd.timestamp
        FROM sensor_data sd
        JOIN sensors s ON sd.sensor_id = s.id
    """
    df = pd.read_sql(query, engine)
    
    if df.empty:
        print("No data available for processing.")
        return

    agg_df = df.groupby(['sensor_id', 'lat', 'lon']).agg(
        avg_pm25=('pm25', 'mean'),
        avg_pm10=('pm10', 'mean'),
        variance_pm25=('pm25', 'var')
    ).reset_index()

    agg_df['variance_pm25'] = agg_df['variance_pm25'].fillna(0)

    coords = agg_df[['lat', 'lon']].values
    clustering = DBSCAN(eps=0.05, min_samples=2).fit(coords)
    agg_df['cluster_id'] = clustering.labels_

    agg_df['is_valid'] = True
    agg_df['rejection_reason'] = RejectionReason.NONE

    for cluster_id in agg_df['cluster_id'].unique():
        if cluster_id == -1:
            continue 

        cluster_mask = agg_df['cluster_id'] == cluster_id
        cluster_data = agg_df[cluster_mask]

        zero_var_mask = cluster_data['variance_pm25'] < 0.1
        agg_df.loc[cluster_mask & zero_var_mask, 'is_valid'] = False
        agg_df.loc[cluster_mask & zero_var_mask, 'rejection_reason'] = RejectionReason.ZERO_VARIANCE

        valid_mask = (agg_df['cluster_id'] == cluster_id) & (agg_df['is_valid'] == True)
        valid_data = agg_df[valid_mask]

        if len(valid_data) > 2:
            iso_forest = IsolationForest(contamination=0.25, random_state=42)

            preds = iso_forest.fit_predict(valid_data[['avg_pm25', 'avg_pm10']])

            outlier_indices = valid_data.iloc[preds == -1].index
            agg_df.loc[outlier_indices, 'is_valid'] = False
            agg_df.loc[outlier_indices, 'rejection_reason'] = RejectionReason.OUTLIER

    timestamp_hour = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    validations_to_insert = []

    print("-" * 50)
    print(f"{'Sensor':<10} | {'Average PM2.5':<15} | {'Status':<10} | {'Reason of rejection'}")
    print("-" * 50)

    for _, row in agg_df.iterrows():
        status = "Accepted" if row['is_valid'] else "Rejected"
        print(f"ID: {int(row['sensor_id']):<6} | {row['avg_pm25']:<15.2f} | {status:<11} | {row['rejection_reason'].name}")

        validation_record = HourlyValidation(
            sensor_id=int(row['sensor_id']),
            timestamp_hour=timestamp_hour,
            cluster_id=int(row['cluster_id']),
            avg_pm25=float(row['avg_pm25']),
            avg_pm10=float(row['avg_pm10']),
            variance_pm25=float(row['variance_pm25']),
            is_valid=bool(row['is_valid']),
            rejection_reason=row['rejection_reason']
        )
        validations_to_insert.append(validation_record)

    db.add_all(validations_to_insert)
    db.commit()
    db.close()
    
    print("-" * 50)
    print("Records have been processed and saved to the database.")

if __name__ == "__main__":
    run_hourly_validation()