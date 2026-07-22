// 야외봄 네이티브 홈에서 사용자 행동 뒤 위치를 요청하고 마지막 출발 판단을 오프라인에도 보여준다.
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { fetchForecastSnapshot, type ForecastSnapshot } from "./src/lib/forecast";
import { loadForecastSnapshot, saveForecastSnapshot } from "./src/lib/storage";

type LocationState = "idle" | "requesting" | "granted" | "denied" | "unavailable";

const SEOUL = { latitude: 37.5665, longitude: 126.978, locationName: "서울 기본값" };
const SUPPORT_URL = process.env.EXPO_PUBLIC_SUPPORT_URL ?? "https://robom.kr/support";
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? "https://robom.kr/privacy/outbom";
const locationLabels: Record<LocationState, string> = {
  idle: "요청 전",
  requesting: "권한 확인 중",
  granted: "현재 위치 사용 가능",
  denied: "위치 권한 거부됨",
  unavailable: "위치 서비스 확인 필요"
};

function formatClock(value: string) {
  const match = value.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "시각 확인";
}

function formatSavedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "저장 시각 확인";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  secondary = false
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        secondary ? styles.actionSecondary : styles.actionPrimary,
        pressed && !disabled ? styles.actionPressed : null,
        disabled ? styles.actionDisabled : null
      ]}
    >
      <Text style={secondary ? styles.actionSecondaryText : styles.actionPrimaryText}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useState<ForecastSnapshot | null>(null);
  const [locationState, setLocationState] = useState<LocationState>("idle");
  const [feedback, setFeedback] = useState("마지막 예보를 불러오는 중이에요.");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void loadForecastSnapshot().then((stored) => {
      if (!active) return;
      setSnapshot(stored);
      setFeedback(
        stored
          ? "저장된 마지막 판단을 보여드리고 있어요."
          : "현재 위치 또는 서울 기본 예보로 첫 판단을 확인해 보세요."
      );
    });
    void Location.getForegroundPermissionsAsync().then((permission) => {
      if (!active) return;
      if (permission.granted) setLocationState("granted");
      else if (!permission.canAskAgain) setLocationState("denied");
    }).catch(() => {
      if (active) setLocationState("unavailable");
    });
    return () => {
      active = false;
    };
  }, []);

  const refreshForecast = async (options: { latitude: number; longitude: number; locationName: string }) => {
    setLoading(true);
    setFeedback(`${options.locationName} 예보를 확인하고 있어요.`);
    try {
      const next = await fetchForecastSnapshot(options);
      setSnapshot(next);
      const saved = await saveForecastSnapshot(next);
      setFeedback(saved ? "새 출발 판단과 예보를 기기에 저장했어요." : "예보는 갱신했지만 기기 저장은 완료하지 못했어요.");
    } catch {
      setFeedback(
        snapshot
          ? "네트워크를 확인하지 못해 저장된 마지막 판단을 유지해요."
          : "예보를 불러오지 못했어요. 연결 뒤 다시 시도해 주세요."
      );
    } finally {
      setLoading(false);
    }
  };

  const useCurrentLocation = async () => {
    setLocationState("requesting");
    setFeedback("현재 위치 권한을 확인하고 있어요.");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationState("denied");
        setFeedback(snapshot ? "위치 권한이 없어 저장된 마지막 판단을 유지해요." : "위치 권한 없이도 서울 기본 예보를 사용할 수 있어요.");
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        setLocationState("unavailable");
        setFeedback("기기 위치 서비스를 켜거나 서울 기본 예보를 이용해 주세요.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocationState("granted");
      await refreshForecast({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        locationName: "현재 위치"
      });
    } catch {
      setLocationState("unavailable");
      setFeedback(snapshot ? "현재 위치를 확인하지 못해 저장된 마지막 판단을 유지해요." : "현재 위치를 확인하지 못했어요. 서울 기본 예보를 이용해 주세요.");
    }
  };

  const busy = loading || locationState === "requesting";
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <View style={styles.logo}><Text style={styles.logoGlyph}>☀︎</Text></View>
          <View style={styles.headerCopy}>
            <Text style={styles.wordmark}>야외봄</Text>
            <Text style={styles.tagline}>바깥바람이 좋은 때</Text>
          </View>
          <Text style={styles.nativeBadge}>NATIVE</Text>
        </View>

        <View style={styles.locationRow}>
          <View>
            <Text style={styles.eyebrow}>현재 위치 사용 상태</Text>
            <Text style={styles.locationState}>{locationLabels[locationState]}</Text>
          </View>
          <View style={[styles.statusDot, locationState === "granted" ? styles.statusDotOn : null]} />
        </View>

        {snapshot ? (
          <View style={styles.hero}>
            <View style={styles.heroTop}>
              <View>
                <Text style={styles.eyebrow}>{snapshot.locationName} · {formatClock(snapshot.forecastTime)} 예보</Text>
                <Text style={styles.judgment}>{snapshot.judgment}</Text>
              </View>
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreValue}>{snapshot.score}</Text>
                <Text style={styles.scoreUnit}>점</Text>
              </View>
            </View>
            <Text style={styles.detail}>{snapshot.detail}</Text>
            <View style={styles.bestWindow}>
              <Text style={styles.bestLabel}>앞으로 12시간 중 추천</Text>
              <Text style={styles.bestValue}>{formatClock(snapshot.bestTime)} · {snapshot.bestScore}점</Text>
            </View>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>저장된 출발 판단이 아직 없어요</Text>
            <Text style={styles.detail}>현재 위치나 서울 기본값으로 한 번 확인하면 마지막 성공 예보를 오프라인에서도 볼 수 있어요.</Text>
          </View>
        )}

        {snapshot ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>마지막 예보</Text>
            <View style={styles.metrics}>
              <Metric label="기온" value={`${Math.round(snapshot.metrics.temperature)}°`} />
              <Metric label="체감" value={`${Math.round(snapshot.metrics.apparentTemperature)}°`} />
              <Metric label="비" value={snapshot.metrics.precipitationProbability === null ? `${snapshot.metrics.precipitation.toFixed(1)}mm` : `${Math.round(snapshot.metrics.precipitationProbability)}%`} />
              <Metric label="바람" value={`${snapshot.metrics.windSpeed.toFixed(1)}m/s`} />
              <Metric label="자외선" value={snapshot.metrics.uvIndex.toFixed(1)} />
              <Metric label="저장" value={formatSavedAt(snapshot.generatedAt)} />
            </View>
            <Text style={styles.caption}>체감온도·강수·바람·자외선 기반의 걷기 최소 판단이며 미세먼지는 아직 반영하지 않아요.</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>예보 확인</Text>
          <Text style={styles.detail}>현재 위치 버튼을 누를 때만 foreground 위치 권한을 요청합니다. 좌표는 예보 요청 뒤 저장하지 않아요.</Text>
          <View style={styles.actions}>
            <ActionButton label="현재 위치로 확인" disabled={busy} onPress={() => void useCurrentLocation()} />
            <ActionButton label="서울 기본 예보" secondary disabled={busy} onPress={() => void refreshForecast(SEOUL)} />
          </View>
          {busy ? <ActivityIndicator color="#2f95a0" /> : null}
        </View>

        <View accessibilityLiveRegion="polite" style={styles.feedback}>
          <Text style={styles.feedbackText}>{feedback}</Text>
        </View>

        <Text style={styles.footer}>권한 거부·오프라인에서도 앱은 저장된 판단으로 계속 열립니다. 위치는 background에서 사용하지 않습니다.</Text>
        <View style={styles.footerLinks}>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(SUPPORT_URL).catch(() => undefined)} style={styles.footerLinkButton}>
            <Text style={styles.footerLink}>지원</Text>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(PRIVACY_URL).catch(() => undefined)} style={styles.footerLinkButton}>
            <Text style={styles.footerLink}>개인정보 처리방침</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fbf7ef" },
  page: { width: "100%", maxWidth: 900, alignSelf: "center", gap: 16, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 40 },
  header: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: "#eaf6f7", borderWidth: 1, borderColor: "#cae4e7" },
  logoGlyph: { color: "#2f95a0", fontSize: 28 },
  headerCopy: { flex: 1 },
  wordmark: { color: "#263c3d", fontSize: 28, fontWeight: "900", letterSpacing: -1 },
  tagline: { marginTop: 2, color: "#728081", fontSize: 13 },
  nativeBadge: { paddingHorizontal: 9, paddingVertical: 6, overflow: "hidden", color: "#1e6670", backgroundColor: "#eaf6f7", borderRadius: 999, fontSize: 10, fontWeight: "900" },
  locationRow: { minHeight: 68, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e8ded1", borderRadius: 20 },
  eyebrow: { color: "#728081", fontSize: 12, fontWeight: "700" },
  locationState: { marginTop: 4, color: "#263c3d", fontSize: 16, fontWeight: "800" },
  statusDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#c9c1b6" },
  statusDotOn: { backgroundColor: "#2f95a0" },
  hero: { gap: 14, padding: 20, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#d7e7e7", borderRadius: 26 },
  heroTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  judgment: { maxWidth: 245, marginTop: 7, color: "#263c3d", fontSize: 25, lineHeight: 32, fontWeight: "900", letterSpacing: -0.8 },
  scoreBadge: { width: 68, height: 68, flexDirection: "row", alignItems: "baseline", justifyContent: "center", paddingTop: 13, borderRadius: 22, backgroundColor: "#eaf6f7" },
  scoreValue: { color: "#1e6670", fontSize: 28, fontWeight: "900" },
  scoreUnit: { color: "#1e6670", fontSize: 12, fontWeight: "800" },
  detail: { color: "#657475", fontSize: 14, lineHeight: 22 },
  bestWindow: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 14, backgroundColor: "#f5fbfb", borderRadius: 16 },
  bestLabel: { color: "#657475", fontSize: 12, fontWeight: "700" },
  bestValue: { color: "#1e6670", fontSize: 14, fontWeight: "900" },
  emptyCard: { gap: 8, padding: 20, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e8ded1", borderRadius: 24 },
  emptyTitle: { color: "#263c3d", fontSize: 20, fontWeight: "900" },
  card: { gap: 14, padding: 18, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e8ded1", borderRadius: 24 },
  cardTitle: { color: "#263c3d", fontSize: 18, fontWeight: "900" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { width: "48%", minHeight: 70, justifyContent: "center", paddingHorizontal: 13, backgroundColor: "#fbf8f2", borderRadius: 16 },
  metricLabel: { color: "#849091", fontSize: 11, fontWeight: "700" },
  metricValue: { marginTop: 5, color: "#263c3d", fontSize: 16, fontWeight: "900" },
  caption: { color: "#879293", fontSize: 11, lineHeight: 17 },
  actions: { gap: 9 },
  action: { minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: 17 },
  actionPrimary: { backgroundColor: "#2f95a0" },
  actionSecondary: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#cfdede" },
  actionPressed: { opacity: 0.78 },
  actionDisabled: { opacity: 0.5 },
  actionPrimaryText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
  actionSecondaryText: { color: "#1e6670", fontSize: 15, fontWeight: "900" },
  feedback: { minHeight: 52, justifyContent: "center", paddingHorizontal: 15, backgroundColor: "#eaf6f7", borderRadius: 17 },
  feedbackText: { color: "#315d61", fontSize: 13, lineHeight: 19, fontWeight: "700" },
  footer: { paddingHorizontal: 5, color: "#879293", fontSize: 11, lineHeight: 18, textAlign: "center" },
  footerLinks: { flexDirection: "row", justifyContent: "center", gap: 8 },
  footerLinkButton: { minHeight: 48, justifyContent: "center", paddingHorizontal: 14 },
  footerLink: { color: "#1e6670", fontSize: 13, fontWeight: "800", textDecorationLine: "underline" }
});
