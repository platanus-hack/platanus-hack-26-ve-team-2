import type { MapStyleElement } from "react-native-maps";

// Estilo de Google Maps con la paleta del diseño (tierra crema, parques verde salvia, agua celeste)
export const vistaMapStyle: MapStyleElement[] = [
  { elementType: "geometry", stylers: [{ color: "#e8e6de" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6f7670" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f4f2ec" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", stylers: [{ visibility: "on" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#cbd8c4" }] },
  { featureType: "poi.park", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#faf9f4" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#ddddd5" }] },
  { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#8a908b" }] },
  { featureType: "road.local", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c4dadd" }] },
  { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: "#d6d5cd" }] },
];
