import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Brand, CircleButton, Icon, PrimaryButton, PrimaryLabel, StatusRow } from "@/components/common";
import { PIN_ANCHOR, SitePin, UserDot, vistaMapStyle } from "@/components/map";
import { useActiveSimulation } from "@/contexts/ActiveSimulationContext";
import { useRegions } from "@/hooks/useRegions";
import { useStartSimulation } from "@/hooks/useStartSimulation";
import { useUserLocation } from "@/hooks/useUserLocation";
import { colors, fonts } from "@/theme";
import { distanceInMeters, isInsidePolygon, ringToLatLngs, walkingMinutes } from "@/utils/geo";

type Mode = "map" | "route";

// Caracas, mientras llegan las regiones
const initialRegion = {
  latitude: 10.4880,
  longitude: -66.8792,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
};

export function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [mode, setMode] = useState<Mode>("map");
  const [selected, setSelected] = useState(0);
  const [cardHeight, setCardHeight] = useState(320);
  // En Android, cambiar mapPadding antes de onMapReady crashea react-native-maps
  const [mapReady, setMapReady] = useState(false);

  const { regions, loading, error, refresh } = useRegions();
  const { start, starting, error: startError } = useStartSimulation();
  const { setActive } = useActiveSimulation();
  const userLocation = useUserLocation();

  // Los encuadres leen la ubicación sin re-encuadrar cada vez que el GPS se mueve
  const userLocationRef = useRef(userLocation);
  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  const shapes = useMemo(
    () =>
      regions.map((r) => ({
        ring: ringToLatLngs(r.geometry.coordinates[0]),
        center: { latitude: r.center.lat, longitude: r.center.lng },
      })),
    [regions],
  );

  const region = regions[selected];
  // La conversación general con Bolívar no cuenta como simulación: es con la que se entra
  const sceneCount = region?.simulations.filter((s) => s.kind !== "general").length ?? 0;
  const shape = shapes[selected];
  const meters = userLocation && shape ? distanceInMeters(userLocation, shape.center) : null;
  const isInside = userLocation && shape ? isInsidePolygon(userLocation, shape.ring) : false;

  // Encuadra todas las regiones al cargar o al volver al modo mapa
  useEffect(() => {
    if (mode !== "map" || !mapReady || shapes.length === 0) return;
    mapRef.current?.fitToCoordinates(
      shapes.flatMap((s) => s.ring),
      { edgePadding: { top: insets.top + 110, right: 90, bottom: 50, left: 90 }, animated: true },
    );
  }, [mode, mapReady, shapes, insets.top]);

  useEffect(() => {
    const user = userLocationRef.current;
    if (mode !== "route" || !mapReady || !shape || !user) return;
    mapRef.current?.fitToCoordinates([user, shape.center], {
      // se suma al mapPadding, que ya reserva el alto de la tarjeta
      edgePadding: { top: insets.top + 120, right: 70, bottom: 60, left: 70 },
      animated: true,
    });
  }, [mode, shape, mapReady, insets.top]);

  function selectRegion(index: number) {
    setSelected(index);
    setMode("map");
  }

  function centerOnUser() {
    if (!userLocation) return;
    mapRef.current?.animateCamera({ center: userLocation, zoom: 17 }, { duration: 500 });
  }

  async function startSimulation() {
    if (!region || starting) return;
    const loaded = await start(region.id);
    if (!loaded) return;
    setActive({ ...loaded, region });
    router.push("/camera");
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        customMapStyle={vistaMapStyle}
        onMapReady={() => setMapReady(true)}
        mapPadding={mapReady ? { top: 0, right: 0, bottom: cardHeight, left: 0 } : undefined}
        showsCompass={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        showsPointsOfInterests={false}
      >
        {mode === "route" && userLocation && shape && (
          <Polyline
            coordinates={[userLocation, shape.center]}
            strokeColor={colors.orange}
            strokeWidth={5}
            lineDashPattern={[2, 10]}
            lineCap="round"
          />
        )}

        {regions.map((r, i) => (
          <Polygon
            key={`${r.id}-area`}
            coordinates={shapes[i].ring}
            strokeColor={selected === i ? colors.orange : colors.green}
            fillColor={selected === i ? "rgba(230,111,61,0.18)" : "rgba(29,58,48,0.14)"}
            strokeWidth={2}
            tappable
            onPress={() => selectRegion(i)}
          />
        ))}

        {regions.map((r, i) => (
          <Marker
            key={`${r.id}-${selected === i}`}
            coordinate={shapes[i].center}
            anchor={PIN_ANCHOR}
            zIndex={selected === i ? 3 : 1}
            onPress={() => selectRegion(i)}
            accessibilityLabel={r.name}
          >
            <SitePin active={selected === i} />
          </Marker>
        ))}

        {userLocation && (
          <Marker coordinate={userLocation} anchor={{ x: 0.5, y: 0.5 }} zIndex={2}>
            <UserDot />
          </Marker>
        )}
      </MapView>

      <View style={[styles.topbar, { paddingTop: insets.top + 12 }]}>
        {mode === "route" ? (
          <CircleButton label="Volver" onPress={() => setMode("map")}>
            <Icon name="back" />
          </CircleButton>
        ) : (
          <Brand />
        )}
        <View style={styles.topActions}>
          <CircleButton label="Buscar">
            <Icon name="search" />
          </CircleButton>
          <CircleButton label="Capas del mapa">
            <Icon name="layers" />
          </CircleButton>
        </View>
      </View>

      <CircleButton
        label="Centrar en mi ubicación"
        variant="white"
        onPress={centerOnUser}
        style={[styles.locate, { bottom: cardHeight + 16 }]}
      >
        <Icon name="locate" />
      </CircleButton>

      <View
        style={[styles.card, { paddingBottom: insets.bottom + 27 }]}
        onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
      >
        <View style={styles.cardHandle} />

        {!region ? (
          <View style={styles.placeholder}>
            {loading ? (
              <>
                <ActivityIndicator color={colors.green} />
                <Text style={styles.description}>Buscando experiencias cercanas…</Text>
              </>
            ) : (
              <>
                <Text style={styles.title}>{error ? "Sin conexión" : "Sin experiencias"}</Text>
                <Text style={styles.description}>
                  {error ? error.message : "Aún no hay experiencias disponibles en el mapa."}
                </Text>
                <PrimaryButton onPress={refresh}>
                  <PrimaryLabel>Reintentar</PrimaryLabel>
                </PrimaryButton>
              </>
            )}
          </View>
        ) : (
          <>
            <View style={styles.eyebrow}>
              <Text style={styles.eyebrowLabel}>{isInside ? "ESTÁS EN LA ZONA" : "EXPERIENCIA CERCANA"}</Text>
              {meters !== null && !isInside && <Text style={styles.distance}>{formatDistance(meters)}</Text>}
            </View>
            <Text style={styles.title}>{region.name}</Text>
            <Text style={styles.description}>{region.simulations[0]?.description ?? region.description}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.meta}>
              {meters !== null && !isInside && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setMode(mode === "route" ? "map" : "route")}
                  style={({ pressed }) => [styles.chip, mode === "route" && styles.chipActive, pressed && { opacity: 0.7 }]}
                >
                  <Icon name="walk" size={17} color="#4f5954" />
                  <Text style={styles.chipText}>{walkingMinutes(meters)} min · Cómo llegar</Text>
                </Pressable>
              )}
              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  {sceneCount} {sceneCount === 1 ? "simulación" : "simulaciones"}
                </Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipText}>Todas las edades</Text>
              </View>
            </ScrollView>

            <View style={styles.actions}>
              {mode === "route" && (
                <StatusRow title="Ya casi llegas" subtitle="Entra en la zona marcada para activar la RA" />
              )}
              {startError && <Text style={styles.error}>{startError.message}</Text>}
              <PrimaryButton onPress={startSimulation} style={styles.startButton}>
                {starting ? <ActivityIndicator color="white" /> : <Icon name="camera" color="white" />}
                <PrimaryLabel>{starting ? "Preparando simulación…" : "Comenzar simulación"}</PrimaryLabel>
                <View style={styles.trailing}>
                  <Icon name="arrow" color="white" />
                </View>
              </PrimaryButton>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `a ${Math.round(meters)} m` : `a ${(meters / 1000).toFixed(1)} km`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.land },
  topbar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topActions: { flexDirection: "row", gap: 9 },
  locate: { position: "absolute", right: 18 },
  card: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.cream,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 22,
    paddingHorizontal: 22,
    shadowColor: "#232d27",
    shadowOpacity: 0.12,
    shadowRadius: 17,
    shadowOffset: { width: 0, height: -8 },
    elevation: 12,
  },
  cardHandle: {
    position: "absolute",
    top: 9,
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 10,
    backgroundColor: "#d5d3cd",
  },
  placeholder: { paddingTop: 8, gap: 4 },
  eyebrow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 5 },
  eyebrowLabel: { color: "#8c5b42", fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1.5 },
  distance: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: "#2b6b50",
    backgroundColor: "#dcebe2",
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 9,
    overflow: "hidden",
  },
  title: { fontFamily: fonts.display, fontSize: 27, letterSpacing: -0.8, marginTop: 8, color: colors.ink },
  description: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
    marginBottom: 15,
  },
  meta: { gap: 8, marginBottom: 17 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 9,
  },
  chipActive: { borderColor: colors.orange },
  chipText: { color: "#4f5954", fontSize: 11, fontFamily: fonts.semibold },
  actions: { gap: 13 },
  error: { color: "#b3402a", fontSize: 12, fontFamily: fonts.medium },
  startButton: { justifyContent: "flex-start" },
  trailing: { marginLeft: "auto" },
});
