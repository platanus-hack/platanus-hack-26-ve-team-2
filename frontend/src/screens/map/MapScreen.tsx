import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Brand, CircleButton, Icon, PrimaryButton, PrimaryLabel, StatusRow } from "@/components/common";
import { PIN_ANCHOR, SitePin, UserDot, vistaMapStyle } from "@/components/map";
import { fallbackLocation, nearestSiteIndex, sites } from "@/data/sites";
import { useUserLocation } from "@/hooks/useUserLocation";
import { colors, fonts } from "@/theme";
import { distanceInMeters, walkingMinutes } from "@/utils/geo";

type Mode = "map" | "route";

const initialRegion = {
  latitude: 10.5058,
  longitude: -66.9150,
  latitudeDelta: 0.004,
  longitudeDelta: 0.004,
};

export function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [mode, setMode] = useState<Mode>("map");
  const [picked, setPicked] = useState<number | null>(null);
  const [cardHeight, setCardHeight] = useState(320);
  // En Android, cambiar mapPadding antes de onMapReady crashea react-native-maps
  const [mapReady, setMapReady] = useState(false);

  const location = useUserLocation();
  const userLocation = location.coords ?? fallbackLocation;
  // Mientras el usuario no elija un pin, mostramos el sitio más cercano
  const selected = picked ?? nearestSiteIndex(userLocation);
  const site = sites[selected];
  const hasFix = location.coords !== null;
  const meters = distanceInMeters(userLocation, site.coordinate);

  // Encuadra al usuario y al sitio elegido. No depende de cada lectura del GPS
  // para no mover el mapa mientras el usuario lo explora.
  useEffect(() => {
    if (!mapReady) return;
    // Con puntos muy cercanos fitToCoordinates no mueve el mapa en Android
    if (distanceInMeters(userLocation, site.coordinate) < 250) {
      mapRef.current?.animateCamera(
        {
          center: {
            latitude: (userLocation.latitude + site.coordinate.latitude) / 2,
            longitude: (userLocation.longitude + site.coordinate.longitude) / 2,
          },
          zoom: 18,
        },
        { duration: 500 },
      );
      return;
    }
    mapRef.current?.fitToCoordinates([userLocation, site.coordinate], {
      // se suma al mapPadding, que ya reserva el alto de la tarjeta
      edgePadding: { top: insets.top + 120, right: 90, bottom: 60, left: 90 },
      animated: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, site, mapReady, hasFix, insets.top]);

  function selectSite(index: number) {
    setPicked(index);
    setMode("map");
  }

  function centerOnUser() {
    mapRef.current?.animateCamera({ center: userLocation, zoom: 17 }, { duration: 500 });
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
        {mode === "route" && (
          <Polyline
            coordinates={[userLocation, site.coordinate]}
            strokeColor={colors.orange}
            strokeWidth={5}
            lineDashPattern={[2, 10]}
            lineCap="round"
          />
        )}

        {sites.map((s, i) => (
          <Marker
            key={`${s.id}-${selected === i}`}
            coordinate={s.coordinate}
            anchor={PIN_ANCHOR}
            zIndex={selected === i ? 3 : 1}
            onPress={() => selectSite(i)}
            accessibilityLabel={s.name}
          >
            <SitePin active={selected === i} />
          </Marker>
        ))}

        <Marker coordinate={userLocation} anchor={{ x: 0.5, y: 0.5 }} zIndex={2}>
          <UserDot />
        </Marker>
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
        <View style={styles.eyebrow}>
          <Text style={styles.eyebrowLabel}>EXPERIENCIA CERCANA</Text>
          <Text style={styles.distance}>a {Math.round(meters)} m</Text>
        </View>
        <Text style={styles.title}>{site.name}</Text>
        <Text style={styles.description}>
          {site.description}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.meta}>
          <View style={styles.chip}>
            <Icon name="walk" size={17} color="#4f5954" />
            <Text style={styles.chipText}>{walkingMinutes(meters)} min caminando</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{site.note}</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>Todas las edades</Text>
          </View>
        </ScrollView>

        {mode === "map" ? (
          <PrimaryButton onPress={() => setMode("route")} style={styles.startRoute}>
            <Icon name="nav" color="white" />
            <PrimaryLabel>Iniciar ruta a pie</PrimaryLabel>
            <View style={styles.trailing}>
              <Icon name="arrow" color="white" />
            </View>
          </PrimaryButton>
        ) : (
          <View style={styles.routeActions}>
            <StatusRow title="Ya casi llegas" subtitle="Entra en la zona marcada para activar la RA" />
            <PrimaryButton onPress={() => router.push({ pathname: "/camera", params: { siteId: site.id } })}>
              <Icon name="camera" color="white" />
              <PrimaryLabel>Abrir cámara RA</PrimaryLabel>
            </PrimaryButton>
          </View>
        )}
      </View>
    </View>
  );
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
  chipText: { color: "#4f5954", fontSize: 11, fontFamily: fonts.semibold },
  startRoute: { justifyContent: "flex-start" },
  trailing: { marginLeft: "auto" },
  routeActions: { gap: 13 },
});
