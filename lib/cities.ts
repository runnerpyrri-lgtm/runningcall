export type CityPreset = {
  id: string;
  name: string;
  region: string;
  latitude: number;
  longitude: number;
};

export const CITY_PRESETS: CityPreset[] = [
  { id: "seoul", name: "서울", region: "수도권", latitude: 37.5665, longitude: 126.978 },
  { id: "busan", name: "부산", region: "영남", latitude: 35.1796, longitude: 129.0756 },
  { id: "incheon", name: "인천", region: "수도권", latitude: 37.4563, longitude: 126.7052 },
  { id: "daegu", name: "대구", region: "영남", latitude: 35.8714, longitude: 128.6014 },
  { id: "daejeon", name: "대전", region: "충청", latitude: 36.3504, longitude: 127.3845 },
  { id: "gwangju", name: "광주", region: "호남", latitude: 35.1595, longitude: 126.8526 },
  { id: "ulsan", name: "울산", region: "영남", latitude: 35.5384, longitude: 129.3114 },
  { id: "sejong", name: "세종", region: "충청", latitude: 36.4801, longitude: 127.289 },
  { id: "suwon", name: "수원", region: "수도권", latitude: 37.2636, longitude: 127.0286 },
  { id: "gangneung", name: "강릉", region: "강원", latitude: 37.7519, longitude: 128.8761 },
  { id: "jeonju", name: "전주", region: "호남", latitude: 35.8242, longitude: 127.148 },
  { id: "jeju", name: "제주", region: "제주", latitude: 33.4996, longitude: 126.5312 }
];

export const DEFAULT_CITY = CITY_PRESETS[0];
