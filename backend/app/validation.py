import pandas as pd
import numpy as np
from datetime import datetime
from sklearn.cluster import DBSCAN
from sklearn.ensemble import IsolationForest
from sqlalchemy.orm import Session
from database import SessionLocal, engine
from models import HourlyValidation

def run_hourly_validation():
    print("🚀 Pokrećem GRANULARNU AI validaciju (minut po minut)...\n")
    db: Session = SessionLocal()

    query = """
        SELECT 
            sd.id as data_id, sd.sensor_id, s.lat, s.lon, sd.pm25, sd.pm10, sd.timestamp
        FROM sensor_data sd
        JOIN sensors s ON sd.sensor_id = s.id
    """
    df = pd.read_sql(query, engine)
    
    if df.empty:
        print("No sensor data found.")
        return

    unique_sensors = df[['sensor_id', 'lat', 'lon']].drop_duplicates()
    coords = unique_sensors[['lat', 'lon']].values
    
    clustering = DBSCAN(eps=0.05, min_samples=2).fit(coords)
    unique_sensors['cluster_id'] = clustering.labels_
    
    df = df.merge(unique_sensors[['sensor_id', 'cluster_id']], on='sensor_id', how='left')

    df['is_valid_minute'] = True

    sensor_variances = df.groupby('sensor_id')['pm25'].var().fillna(0)
    
    for sensor_id, variance in sensor_variances.items():
        if variance < 0.1:
            df.loc[df['sensor_id'] == sensor_id, 'is_valid_minute'] = False

    for cluster_id in df['cluster_id'].unique():
        if cluster_id == -1:
            continue
            
        cluster_mask = df['cluster_id'] == cluster_id
        valid_mask = cluster_mask & (df['is_valid_minute'] == True)
        
        cluster_data = df[valid_mask]
        
        if len(cluster_data) > 10:
            iso_forest = IsolationForest(contamination=0.15, random_state=42)
            preds = iso_forest.fit_predict(cluster_data[['pm25', 'pm10']])

            outlier_indices = cluster_data.iloc[preds == -1].index
            df.loc[outlier_indices, 'is_valid_minute'] = False

    timestamp_hour = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    validations_to_insert = []

    print("-" * 65)
    print(f"{'Sensor':<10} | {'Total minutes':<15} | {'Valid minutes':<15} | {'Average PM25'}")
    print("-" * 65)

    for sensor_id in df['sensor_id'].unique():
        sensor_data = df[df['sensor_id'] == sensor_id]
        
        total_readings = len(sensor_data)
        
        valid_data = sensor_data[sensor_data['is_valid_minute'] == True]
        valid_readings = len(valid_data)
        
        if valid_readings > 0:
            clean_avg_pm25 = valid_data['pm25'].mean()
            clean_avg_pm10 = valid_data['pm10'].mean()
        else:
            clean_avg_pm25 = 0.0 
            clean_avg_pm10 = 0.0

        cluster_id = int(sensor_data['cluster_id'].iloc[0])
        variance = float(sensor_variances[sensor_id])

        print(f"ID: {int(sensor_id):<6} | {total_readings:<15} | {valid_readings:<15} | {clean_avg_pm25:.2f}")

        validation_record = HourlyValidation(
            sensor_id=int(sensor_id),
            timestamp_hour=timestamp_hour,
            cluster_id=cluster_id,
            avg_pm25=float(clean_avg_pm25),
            avg_pm10=float(clean_avg_pm10),
            variance_pm25=variance,
            total_readings=total_readings,
            valid_readings=valid_readings
        )
        validations_to_insert.append(validation_record)

    db.add_all(validations_to_insert)
    db.commit()
    db.close()
    
    print("-" * 65)
    print("Granular results successfully saved to 'hourly_validations'!")

if __name__ == "__main__":
    run_hourly_validation()