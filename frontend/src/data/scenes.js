export const SCENES = [
  { id: 'storm', icon: '🌧️', name: '暴风雨', event: { rain_detected: true, rain_level: 'storm', wind_speed_ms: 12, wind_level: 6, human_detected: true } },
  { id: 'child', icon: '👶', name: '儿童靠窗', event: { room_type: 'child_room', co2_ppm: 1280, human_detected: true } },
  { id: 'night', icon: '🌙', name: '深夜闷热', event: { time_hour: 2, co2_ppm: 1400, human_detected: true, room_type: 'bedroom' } },
  { id: 'sun', icon: '☀️', name: '午后西晒', event: { lux: 55000, temp_indoor_c: 33, time_hour: 15, orientation: 'W', human_detected: true } },
  { id: 'pet', icon: '🐱', name: '宠物独处', event: { has_pets: true, human_detected: false } },
  { id: 'elderly', icon: '👴', name: '老人防寒', event: { room_type: 'elderly_room', temp_indoor_c: 16, temp_outdoor_c: 2, human_detected: true } },
  { id: 'forecast', icon: '⛈️', name: '暴雨预警', event: { forecast_rain_prob: 0.88, pressure_trend: 'plunging', human_detected: true } },
  { id: 'voc', icon: '💨', name: 'VOC突变', event: { voc_mg: 1.2, human_detected: true } },
]
