// src/components/hooks/useCameraBarcode.js
import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function useCameraBarcode({ onDetected, formats } = {}) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(null);
  const [active, setActive] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const trackRef = useRef(null);

  const listCameras = useCallback(async () => {
    const all = await BrowserMultiFormatReader.listVideoInputDevices();
    setDevices(all);
    if (all.length && !deviceId) {
      // Préfère la caméra arrière si on la détecte
      const back =
        all.find((d) => /back|arrière|rear/i.test(d.label))?.deviceId || all[0].deviceId;
      setDeviceId(back);
    }
  }, [deviceId]);

  const start = useCallback(async () => {
    if (!videoRef.current || active) return;
    readerRef.current = new BrowserMultiFormatReader();
    await listCameras();
    const id = deviceId || (devices[0] && devices[0].deviceId);
    if (!id) throw new Error("Aucune caméra détectée");

    setActive(true);
    const controls = await readerRef.current.decodeFromVideoDevice(
      id,
      videoRef.current,
      (result, err, controls) => {
        if (result?.getText) {
          const code = result.getText();
          onDetected?.(code);
        }
      }
    );

    // garder une référence vers la piste vidéo pour torche
    const stream = videoRef.current?.srcObject;
    const track = stream?.getVideoTracks?.()[0];
    trackRef.current = track;
  }, [devices, deviceId, active, onDetected, listCameras]);

  const stop = useCallback(() => {
    setActive(false);
    try {
      readerRef.current?.reset();
    } catch {}
    const track = trackRef.current;
    if (track) {
      try { track.stop(); } catch {}
    }
    trackRef.current = null;
  }, []);

  // torche si supportée
  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    const caps = track.getCapabilities?.();
    if (!caps?.torch) return; // non supporté
    const newVal = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: newVal }] });
    setTorchOn(newVal);
  }, [torchOn]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    videoRef,
    devices,
    deviceId,
    setDeviceId,
    active,
    start,
    stop,
    torchOn,
    toggleTorch,
  };
}
