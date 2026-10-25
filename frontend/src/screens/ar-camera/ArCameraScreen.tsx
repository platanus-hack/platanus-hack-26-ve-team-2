import { ViroARSceneNavigator } from "@reactvision/react-viro";
import { File } from "expo-file-system";
import { Redirect, router, useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { AppState, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CameraShade,
  MicPermissionPrompt,
  MovePanel,
  MoveSurface,
  PushToTalkButton,
  SceneSizeControl,
  SimulationsSheet,
} from "@/components/ar";
import { VistaARScene } from "@/components/ar/VistaARScene";
import { CircleButton, Icon, PrimaryButton, PrimaryLabel, StatusRow } from "@/components/common";
import { type ActiveSimulation, useActiveSimulation } from "@/contexts/ActiveSimulationContext";
import { arSession, useArSession } from "@/hooks/useArSession";
import { useBattleDirector } from "@/hooks/useBattleDirector";
import { useMicrophonePermission } from "@/hooks/useMicrophonePermission";
import { getSimulationChoreography, getSimulationObjects } from "@/data/simulationObjects";
import { requestStartupPermissions } from "@/hooks/useStartupPermissions";
import { useSimulationConversation } from "@/hooks/useSimulationConversation";
import { useStartSimulation } from "@/hooks/useStartSimulation";
import { colors, fonts } from "@/theme";
import { followCommand } from "@/utils/followCommands";
import type { ImageFile } from "@/types/voice";
import { mouthOpenness } from "@/utils/lipsync";

type CameraPermission = "pending" | "granted" | "denied";


function useCameraPermission(): CameraPermission {
  const [permission, setPermission] = useState<CameraPermission>(Platform.OS === "android" ? "pending" : "granted");

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const { CAMERA } = PermissionsAndroid.PERMISSIONS;

    // Si otro permiso (micrófono, ubicación) se pide a la vez, Android puede dejar esta promesa sin
    // resolver, así que primero revisamos y volvemos a revisar cuando la app regresa al frente.
    async function sync(askIfMissing: boolean) {
      await requestStartupPermissions();
      if (await PermissionsAndroid.check(CAMERA)) return setPermission("granted");
      if (!askIfMissing) return;
      const result = await PermissionsAndroid.request(CAMERA);
      setPermission(result === PermissionsAndroid.RESULTS.GRANTED ? "granted" : "denied");
    }

    sync(true);
    const sub = AppState.addEventListener("change", (state) => state === "active" && sync(false));
    return () => sub.remove();
  }, []);

  return permission;
}

// ARCore reutiliza una sola sesión nativa: si se vuelve a montar la cámara RA apenas se cerró la
// anterior, puede reanudar con el rastreo roto y abortar la app. Esperamos a que termine de soltarse
const AR_REMOUNT_COOLDOWN_MS = 2000;
let lastArUnmountAt = 0;

/** true cuando ya pasó el tiempo de espera desde que se cerró la última sesión RA. */
function useArCooldown(): boolean {
  const [ready, setReady] = useState(() => Date.now() - lastArUnmountAt >= AR_REMOUNT_COOLDOWN_MS);
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setReady(true), AR_REMOUNT_COOLDOWN_MS - (Date.now() - lastArUnmountAt));
    return () => clearTimeout(timer);
  }, [ready]);
  return ready;
}

export function ArCameraScreen() {
  const { active } = useActiveSimulation();
  // Se llega aquí solo desde "Comenzar simulación"; sin simulación activa no hay escena que montar
  if (!active) return <Redirect href="/" />;
  return <ArSimulationView active={active} />;
}

function ArSimulationView({ active }: { active: ActiveSimulation }) {
  const insets = useSafeAreaInsets();
  const { setActive } = useActiveSimulation();
  const { start } = useStartSimulation();
  const camera = useCameraPermission();
  // Solo una sesión de RA a la vez: si hay otra pantalla encima, esta suelta la cámara
  const focused = useIsFocused();
  // Lo primero al entrar a la simulación: pedir el micrófono
  const mic = useMicrophonePermission();
  const navigator = useRef<ViroARSceneNavigator>(null);
  // "¿Qué es esto?": captura de la vista RA (cámara + escena) para que el personaje la mire. Viro la
  // guarda como JPEG en la caché; el personaje 3D sale en ella y el servidor le pide ignorarlo
  async function captureFrame(): Promise<ImageFile | null> {
    const result = await navigator.current?._takeScreenshot(`mirar-${Date.now()}`, false);
    if (!result?.success || !result.url) return null;
    const url: string = result.url;
    const uri = url.startsWith("file://") ? url : `file://${url}`;
    // Achicada sube en una fracción del tiempo. Si la build no trae el módulo nativo, va la original
    try {
      const { shrinkImage } = await import("@/utils/shrinkImage");
      const small = await shrinkImage(uri);
      new File(uri).delete();
      return { uri: small, name: "captura.jpg", type: "image/jpeg" };
    } catch (e) {
      if (__DEV__) console.warn("[Mirar] no se pudo achicar la captura, se sube completa", e);
      return { uri, name: "captura.jpg", type: "image/jpeg" };
    }
  }
  // Lipsync: el visema que suena mueve la boca del anfitrión directo en el modelo nativo
  const conversation = useSimulationConversation(
    active.simulationId,
    (viseme) => arSession.setMouth(mouthOpenness(viseme)),
    captureFrame,
  );
  const [scenesOpen, setScenesOpen] = useState(false);

  const tracking = useArSession((s) => s.tracking);
  const floorFound = useArSession((s) => s.floorY !== null);
  const hasFloor = useArSession((s) => s.floor !== null);
  // Distancia horizontal (m, redondeada) a la que quedaría el personaje
  const floorDistance = useArSession((s) =>
    s.floor ? Math.round(Math.hypot(s.floor.point[0] - s.floor.camera[0], s.floor.point[2] - s.floor.camera[2]) * 2) / 2 : null,
  );
  const placed = useArSession((s) => s.placement !== null);
  const modelStatus = useArSession((s) => s.modelStatus);
  const follow = useArSession((s) => s.follow);
  const faceUser = useArSession((s) => s.faceUser);
  const editing = useArSession((s) => s.editing);
  const moveNotice = useArSession((s) => s.moveNotice);
  // Coreografía de campo abierto (las trincheras): se arma frente al usuario y el anfitrión no se ve
  const fieldScene = useArSession((s) => s.choreography?.layout === "field");
  // El campo ya se armó: su tamaño se puede ajustar
  const fieldPlaced = useArSession((s) => s.choreography?.layout === "field" && s.field !== null);
  // El anfitrión que llega caminando ya tiene su lugar definido: ese no se puede mover. En las
  // coreografías tampoco: en la batalla deciden dónde está cada uno y en el campo está oculto
  const movableHost = useArSession((s) => {
    const host = s.objects.find((o) => o.kind === "dynamic");
    return !!host && host.kind === "dynamic" && !host.entrance && s.battle === "off";
  });
  const battle = useArSession((s) => s.battle);
  // Efectos de sonido y final de la coreografía (la batalla), si la simulación tiene
  useBattleDirector(active.choreography);

  const { region } = active;
  const current = region.simulations.find((s) => s.id === active.simulationId);
  const { phase, lastTurn, error, looking } = conversation;
  const hasObjects = active.objects.length > 0;

  const cooledDown = useArCooldown();
  const arMounted = focused && cooledDown && camera === "granted" && hasObjects && mic.status !== "checking";
  // Anotamos cuándo se cerró la sesión RA para no reabrirla demasiado pronto
  useEffect(() => {
    if (!arMounted) return;
    return () => {
      lastArUnmountAt = Date.now();
    };
  }, [arMounted]);

  // Al salir de la pantalla la sesión AR se destruye: todo vuelve al estado inicial
  useEffect(() => () => arSession.reset(), []);

  // Otra simulación = otros objetos: se vuelven a colocar en el piso
  useEffect(() => {
    arSession.loadObjects(active.objects, active.choreography ?? null);
  }, [active.objects, active.choreography]);

  // Los personajes de las otras simulaciones de la región se cargan ocultos desde ya: al cambiar de
  // simulación aparecen al instante. Los de campo abierto no: son muchos soldados y se cargan al elegirla
  useEffect(() => {
    const preloadable = region.simulations.filter((s) => getSimulationChoreography(s.id)?.layout !== "field");
    arSession.setPreload(preloadable.flatMap((s) => getSimulationObjects(s.id) ?? []));
  }, [region, active.objects]);

  // Simulación pedida más recientemente: una respuesta vieja de la API no la pisa
  const requested = useRef(active.simulationId);

  // Mientras habla, gesticula
  const speaking = phase === "speaking";
  const wasSpeaking = useRef(false);
  useEffect(() => {
    // Solo en los cambios reales: un talk(false) al colocarlo pisaría el saludo inicial
    if (speaking === wasSpeaking.current) return;
    wasSpeaking.current = speaking;
    if (__DEV__) console.log("[AR] lipsync", speaking ? "empieza a hablar" : "deja de hablar");
    arSession.talk(speaking);
  }, [speaking]);

  // El presentador lanzó una escena que pidió el visitante: se abre cuando termina de presentarla
  const { action, takeAction } = conversation;
  useEffect(() => {
    if (!action || phase !== "idle") return;
    const ready = takeAction();
    if (ready?.type === "start_simulation" && region.simulations.some((s) => s.id === ready.simulation_id)) {
      void switchSimulation(ready.simulation_id);
    }
    // switchSimulation es una función del render: se usa la del momento en que la acción quedó lista
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, phase]);

  // "Sígueme" / "quédate aquí" en la conversación activan o desactivan el modo seguir
  useEffect(() => {
    const command = followCommand(lastTurn?.transcript);
    if (command !== null) arSession.setFollow(command);
  }, [lastTurn]);

  async function switchSimulation(simulationId: string) {
    setScenesOpen(false);
    if (simulationId === active.simulationId) return;
    requested.current = simulationId;
    // Los objetos y la coreografía viven en el teléfono: se cambia al instante, sin esperar a la API
    const objects = getSimulationObjects(simulationId);
    if (objects) {
      setActive({ ...active, simulationId, objects, choreography: getSimulationChoreography(simulationId) });
    }
    // La API confirma la simulación (y su contexto de voz); si falla, se queda la versión local
    const loaded = await start(region.id, simulationId);
    if (loaded && requested.current === simulationId) setActive({ ...loaded, region });
  }

  const status = (() => {
    if (camera === "denied") return { title: "Sin acceso a la cámara", subtitle: "Actívalo en los ajustes del teléfono" };
    if (!hasObjects) return { title: "Simulación sin modelos 3D", subtitle: "Esta simulación todavía no tiene personajes" };
    if (camera === "pending") return { title: "Preparando la cámara…", subtitle: "Acepta el permiso si te lo pide" };
    if (mic.status === "checking") return { title: "Preparando el micrófono…", subtitle: "Acepta el permiso si te lo pide" };
    if (!tracking) return { title: "Escaneando el entorno…", subtitle: "Mueve el teléfono despacio" };
    if (hasFloor)
      return {
        title: `Simulación alineada · a ${String(floorDistance).replace(".", ",")} m`,
        subtitle:
          current?.space === "open"
            ? "Necesitas unos 6 m libres: la escena se arma frente a ti y se ajusta al espacio"
            : "Inclina el teléfono para acercarla o alejarla y toca para comenzar",
      };
    if (!floorFound)
      return { title: "Escaneando el piso…", subtitle: "Apunta al piso y mueve el teléfono de lado a lado" };
    return { title: "Apunta la cámara al piso", subtitle: "Busca una zona despejada a 1 o 2 metros" };
  })();
  const canStart = hasObjects && tracking && hasFloor;

  // Se puede mover cuando el personaje está listo y visible
  const canMove = placed && movableHost && modelStatus === "ready" && tracking;
  const isEditing = editing && canMove;
  // El aviso del modo "mover" se va solo
  useEffect(() => {
    if (!moveNotice) return;
    const timer = setTimeout(() => arSession.set({ moveNotice: null }), 2800);
    return () => clearTimeout(timer);
  }, [moveNotice]);

  const placedHint = (() => {
    if (modelStatus === "error") return "No se pudo cargar el personaje";
    if (modelStatus !== "ready") return "Cargando el personaje…";
    // Al pasar el teléfono a otra persona ARCore puede perder el rastreo un momento
    if (!tracking) return "Recuperando el rastreo, mueve el teléfono despacio";
    if (fieldScene) {
      if (battle === "waiting") return "Mira al frente, hacia el espacio libre: un bando quedará a cada lado";
      if (battle === "playing") return "¡Fuego cruzado! Mira a ambos lados";
      if (battle === "finished") return "¡Los realistas se retiran! La Victoria resiste";
      return null;
    }
    if (battle === "waiting") return "Preparando la batalla…";
    if (battle === "playing") return "¡Monteverde ataca! Mira la batalla";
    if (battle === "finished") return "¡Fin de la batalla!";
    return null;
  })();
  // En el campo se puede seguir conversando con el anfitrión mientras corre la escena; al terminar,
  // como en la batalla, se ofrece repetirla
  const inBattle = fieldScene ? battle === "finished" : battle !== "off";

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {/* ARKit/ARCore arranca recién cuando el permiso del micrófono está resuelto: el diálogo del
          sistema pone la app en "inactive" y, si aparece mientras la sesión AR inicializa, el
          rastreo puede no volver a reportarse (se queda en "Escaneando el entorno…") */}
      {arMounted && (
        <ViroARSceneNavigator
          ref={navigator}
          autofocus
          initialScene={{ scene: VistaARScene }}
          // Sin anchors en la nube: todo es local al teléfono
          provider="none"
          // Sin oclusión: con la profundidad de ARCore el personaje se tapaba a pedazos
          occlusionMode="disabled"
          // Pero sí la profundidad: da hits "DepthPoint" en pisos lisos (alfombra, baldosa) donde ARCore
          // casi no encuentra puntos de textura, y así el piso se detecta mucho antes
          depthEnabled
          // Sin materiales emisivos el bloom no se ve: es una pasada de post-proceso menos por frame
          bloomEnabled={false}
          style={StyleSheet.absoluteFill}
        />
      )}
      <CameraShade />

      <View style={[styles.top, { paddingTop: insets.top + 12 }]}>
        <CircleButton label="Volver" variant="glass" onPress={() => router.back()}>
          <Icon name="back" color="white" />
        </CircleButton>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>RA EN VIVO</Text>
        </View>
        <CircleButton label="Sonido" variant="glass">
          <Icon name="sound" color="white" />
        </CircleButton>
      </View>

      <View style={[styles.stage, { top: insets.top + 90, bottom: insets.bottom + 230 }]} pointerEvents="none">
        {!placed ? (
          tracking &&
          !hasFloor && (
            <View style={styles.direction}>
              <Icon name="arrow" size={18} color="white" />
              <Text style={styles.directionText}>Apunta al piso frente a ti</Text>
            </View>
          )
        ) : (
          // Sin subtítulos de lo que responde el personaje: solo se escucha
          isEditing && (
            <View style={styles.tip}>
              <Text style={styles.tipTitle}>Modo mover</Text>
              {moveNotice ? (
                <Text style={styles.tipText}>{moveNotice}</Text>
              ) : (
                <>
                  <Text style={styles.tipText}>Toca el piso donde quieras ponerlo, aunque sea a tu espalda: gira y toca</Text>
                  <Text style={styles.tipText}>Desliza un dedo para ajustarlo y usa los botones para orientarlo</Text>
                </>
              )}
            </View>
          )
        )}
      </View>

      {/* Debajo de los controles: en modo "mover" el dedo en la pantalla mueve al personaje */}
      {isEditing && <MoveSurface />}

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 28 }]}>
        {isEditing ? (
          <MovePanel />
        ) : !placed ? (
          <>
            <View style={styles.ready}>
              <StatusRow dark title={status.title} subtitle={status.subtitle} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Iniciar simulación"
              accessibilityState={{ disabled: !canStart }}
              disabled={!canStart}
              onPress={() => arSession.place()}
              style={({ pressed }) => [
                styles.shutter,
                !canStart && { opacity: 0.4 },
                pressed && { transform: [{ scale: 0.95 }] },
              ]}
            >
              <View style={styles.shutterInner} />
            </Pressable>
            <Text style={styles.hint}>Mantén el teléfono en alto y muévete despacio</Text>
          </>
        ) : (
          <>
            <View style={styles.chips}>
              {canMove && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mover y orientar al personaje"
                  onPress={() => arSession.startEditing()}
                  style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
                >
                  <Icon name="move" size={16} color="white" />
                  <Text style={styles.chipText}>Mover</Text>
                </Pressable>
              )}
              {/* Lo orientaron a mano: con esto vuelve a girarse solo para mirar al usuario */}
              {canMove && !faceUser && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Que vuelva a mirarme"
                  onPress={() => arSession.lookAtUser()}
                  style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
                >
                  <Icon name="eye" size={16} color="white" />
                  <Text style={styles.chipText}>Mirarme</Text>
                </Pressable>
              )}
              {fieldPlaced && <SceneSizeControl />}
            </View>
            <View style={styles.sceneLabel}>
              <Text style={styles.nowPlaying}>{current?.kind === "general" ? "EN CONVERSACIÓN" : "REPRODUCIENDO"}</Text>
              <Text style={styles.sceneTitle}>{current?.title ?? region.name}</Text>
              <Text style={[styles.remaining, error && styles.error]} numberOfLines={2}>
                {placedHint ??
                  error ??
                  (looking ? "Mirando lo que me muestras…" : null) ??
                  (lastTurn?.transcript ? `Tú: “${lastTurn.transcript}”` : "Pregúntale lo que quieras")}
              </Text>
            </View>

            {inBattle ? (
              // En la batalla no se conversa: al terminar se puede repetir o elegir otra simulación
              <View style={styles.talkRow}>
                <View style={styles.side} />
                {battle === "finished" ? (
                  <PrimaryButton onPress={() => arSession.replayBattle()} style={styles.replay}>
                    <Icon name="replay" color="white" />
                    <PrimaryLabel>{fieldScene ? "Repetir escena" : "Repetir batalla"}</PrimaryLabel>
                  </PrimaryButton>
                ) : (
                  <View />
                )}
                <View style={styles.side}>
                  <CircleButton label="Ver simulaciones disponibles" variant="glass" onPress={() => setScenesOpen(true)}>
                    <Icon name="layers" color="white" />
                  </CircleButton>
                </View>
              </View>
            ) : mic.status === "granted" ? (
              <View style={styles.talkRow}>
                <View style={styles.side}>
                  {/* En el campo el anfitrión está oculto: no tiene a quién seguir */}
                  {!fieldScene && (
                    <CircleButton
                      label={follow ? "Dejar de seguirme" : "Seguirme"}
                      variant={follow ? "solid" : "glass"}
                      onPress={() => arSession.setFollow(!follow)}
                    >
                      <Icon name="walk" color={follow ? colors.ink : "white"} />
                    </CircleButton>
                  )}
                </View>
                <PushToTalkButton
                  phase={phase}
                  onPressIn={conversation.startTalking}
                  onPressOut={conversation.stopTalking}
                />
                <View style={styles.side}>
                  <CircleButton label="Ver simulaciones disponibles" variant="glass" onPress={() => setScenesOpen(true)}>
                    <Icon name="layers" color="white" />
                  </CircleButton>
                </View>
              </View>
            ) : (
              <MicPermissionPrompt status={mic.status} onRequest={mic.request} />
            )}
          </>
        )}
      </View>

      <SimulationsSheet
        visible={scenesOpen}
        siteName={region.name}
        simulations={region.simulations}
        currentId={active.simulationId}
        onSelect={switchSimulation}
        onClose={() => setScenesOpen(false)}
      />
    </View>
  );
}

const glass = {
  backgroundColor: "rgba(19,33,27,0.6)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.18)",
} as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#08110e" },
  top: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 3,
  },
  livePill: {
    ...glass,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#f07242", marginRight: 6 },
  liveText: { color: "white", fontSize: 10, fontFamily: fonts.bold, letterSpacing: 1.5 },
  stage: { position: "absolute", left: 0, right: 0, alignItems: "center", justifyContent: "center" },
  direction: {
    ...glass,
    backgroundColor: "rgba(21,36,29,0.78)",
    position: "absolute",
    top: "6%",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 22,
  },
  directionText: { color: "white", fontSize: 12, fontFamily: fonts.medium },
  tip: {
    ...glass,
    backgroundColor: "rgba(21,36,29,0.82)",
    position: "absolute",
    top: "4%",
    marginHorizontal: 24,
    alignItems: "center",
    gap: 3,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  tipTitle: { color: "white", fontSize: 13, fontFamily: fonts.bold, marginBottom: 2 },
  tipText: { color: "#dfe5e1", fontSize: 11, fontFamily: fonts.regular, textAlign: "center" },
  chips: { flexDirection: "row", gap: 8 },
  chip: {
    ...glass,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 18,
    marginBottom: 12,
  },
  chipText: { color: "white", fontSize: 12, fontFamily: fonts.medium },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 20, paddingHorizontal: 24, zIndex: 3 },
  ready: { alignItems: "center" },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 3,
    borderColor: "white",
    padding: 6,
    alignSelf: "center",
    marginTop: 18,
    marginBottom: 12,
  },
  shutterInner: { flex: 1, borderRadius: 31, backgroundColor: colors.orange },
  hint: { color: "#c7cfca", fontSize: 11, fontFamily: fonts.regular, textAlign: "center" },
  sceneLabel: { marginBottom: 15 },
  nowPlaying: { color: "#f4b47f", fontSize: 9, letterSpacing: 1.3, fontFamily: fonts.bold },
  sceneTitle: { color: "white", fontFamily: fonts.displayBold, fontSize: 17, marginTop: 3 },
  remaining: { color: "#c6cec9", fontSize: 11, fontFamily: fonts.regular, marginTop: 3 },
  error: { color: "#f4b47f" },
  talkRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  side: { width: 44, marginTop: 20 },
  replay: { marginTop: 16 },
});
