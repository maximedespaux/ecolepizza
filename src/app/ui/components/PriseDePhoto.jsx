import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon.jsx";
import { useEchap } from "../lib/useEchap.js";

/**
 * Prendre une photo SANS QUITTER LA PAGE — aperçu en direct, puis déclencheur.
 *
 * POURQUOI PAS SIMPLEMENT `capture` SUR UN `<input>`. C'était le premier essai : deux lignes,
 * l'appareil photo natif s'ouvre… sur téléphone uniquement. Sur ordinateur l'attribut est
 * PUREMENT IGNORÉ et le bouton rouvre le sélecteur de fichiers — il ment sur ce qu'il fait.
 * On l'avait donc masqué sur poste fixe, ce qui revenait à ne pas rendre le service demandé :
 * un formateur devant son écran a une webcam et veut s'en servir.
 *
 * `getUserMedia` marche des DEUX côtés. Il exige un contexte sécurisé (HTTPS, ou localhost) —
 * d'où le repli sur l'`<input capture>` quand `navigator.mediaDevices` n'existe pas, cas d'une
 * application servie en HTTP nu sur une IP de réseau local.
 *
 * CE QUI SE PAIE CHER SI ON L'OUBLIE : arrêter les pistes. Un flux vidéo laissé ouvert garde la
 * CAMÉRA ALLUMÉE — voyant compris — bien après la fermeture de la fenêtre. On l'arrête donc à
 * la fermeture, au démontage, et sur erreur ; `arreter()` est idempotent, il est appelé par
 * plusieurs chemins.
 *
 * `facingMode: { ideal: 'environment' }` et non `exact` : sur téléphone on veut la caméra
 * arrière (on photographie une pâte), sur ordinateur il n'y en a qu'une — `exact` y ferait
 * échouer la demande au lieu de prendre ce qui existe.
 */
export default function PriseDePhoto({ onPhoto, onClose }) {
  const videoRef = useRef(null);
  const fluxRef = useRef(null);
  const [erreur, setErreur] = useState(null);
  const [prete, setPrete] = useState(false);
  useEchap(onClose);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const flux = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1600 }, height: { ideal: 1200 } },
          audio: false,
        });
        // Fenêtre fermée pendant que l'utilisateur répondait à la demande d'autorisation : le
        // flux arrive alors qu'il n'y a plus personne pour l'afficher. Sans ceci, la caméra
        // resterait allumée sans aucune fenêtre visible.
        if (annule) { flux.getTracks().forEach((t) => t.stop()); return; }
        fluxRef.current = flux;
        if (videoRef.current) { videoRef.current.srcObject = flux; await videoRef.current.play().catch(() => {}); }
        setPrete(true);
      } catch (e) {
        // On nomme la cause : « NotAllowedError » ne dit rien à qui vient de cliquer « Bloquer ».
        setErreur(
          e?.name === "NotAllowedError" ? "Accès à la caméra refusé. Autorisez-le dans votre navigateur, puis réessayez."
            : e?.name === "NotFoundError" ? "Aucune caméra détectée sur cet appareil."
              : "Caméra indisponible. Utilisez « Choisir une photo »."
        );
      }
    })();
    return () => { annule = true; arreter(); };
    // eslint-disable-next-line
  }, []);

  /** Idempotent : appelé au démontage, à la fermeture et après la capture. */
  function arreter() {
    fluxRef.current?.getTracks().forEach((t) => t.stop());
    fluxRef.current = null;
  }

  function capturer() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    // Taille INTRINSÈQUE du flux, pas celle affichée : l'aperçu est mis à l'échelle par le CSS,
    // capturer sa taille à l'écran donnerait une photo au rabais.
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d").drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return setErreur("La capture a échoué. Réessayez.");
      arreter();
      // JPEG plutôt que PNG : `reduireImage` réencodera en WebP, mais un PNG intermédiaire de
      // plusieurs mégaoctets traverserait la mémoire pour rien.
      onPhoto(new File([blob], "photo.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  }

  const fermer = () => { arreter(); onClose(); };

  return createPortal(
    <div className="overlay" onClick={fermer}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ fontSize: 16 }}>Prendre une photo</h3>
          <button className="x" onClick={fermer} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        <div className="mbody">
          {erreur ? (
            <div className="status err" style={{ margin: 0 }}>{erreur}</div>
          ) : (
            <>
              <video ref={videoRef} playsInline muted autoPlay className="prise-video" />
              {!prete && <p className="hint" style={{ marginTop: 8 }}>Ouverture de la caméra…</p>}
            </>
          )}
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={fermer}>Annuler</button>
          <button className="btn primary" disabled={!prete || !!erreur} onClick={capturer}>
            <Icon name="camera" size={14} /> Capturer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
