import { MediaSettings } from "../components/mediaSettings/index.js";
import { uiLogger as logger } from "../../utils/logger.js";
/**
 * @class
 * @classdesc Manages the settings control (button and modal) for the room UI
 */
export class SettingsControl {
  /** @constructor
   * @param {HTMLElement} controls - The settings button element
   * @param {HTMLElement} settingsModal - The settings modal element
   * @param {RoomManager} roomManager - The room manager instance
   * @param {RoomUI} roomUI - The room UI instance
   */
  constructor(controls, settingsModal, roomManager, roomUI) {
    this.controls = controls;
    this.settingsModal = settingsModal;

    const mediaSettings = new MediaSettings(this.settingsModal, {
      initialStream: roomManager.webrtc.localStream,
      onStreamUpdate: (newStream) => {
        // Update room's stream when settings change
        roomManager.webrtc.updateLocalStream(newStream);
        roomUI.setLocalStream(newStream);

        // Update UI controls to match new stream state
        const videoTrack = newStream.getVideoTracks()[0];
        const audioTrack = newStream.getAudioTracks()[0];

        if (videoTrack) {
          roomUI.mediaControls.updateVideoState(!videoTrack.enabled);
        }

        if (audioTrack) {
          roomUI.mediaControls.updateAudioState(!audioTrack.enabled);
        }
      },
      showCloseButton: true,
      showMicControl: false, // We already have the mic control in the panel at the bottom
      showCameraControl: false, // We already have the camera control in the panel at the bottom
    });

    this.mediaSettings = mediaSettings;

    // Link media settings controls to room controls
    mediaSettings.onToggleVideo = (enabled) => {
      controls.video.dataset.disabled = (!enabled).toString();
      // Update control icon state
      const controlIcon = controls.video.querySelector(".control-icon");
      if (controlIcon) {
        controlIcon.dataset.disabled = (!enabled).toString();
      }
    };

    mediaSettings.onToggleMic = (enabled) => {
      controls.audio.dataset.muted = (!enabled).toString();
      // Update control icon state
      const controlIcon = controls.audio.querySelector(".control-icon");
      if (controlIcon) {
        controlIcon.dataset.muted = (!enabled).toString();
      }
    };

    controls.settings.addEventListener("click", () => {
      settingsModal.classList.remove("hidden");
    });

    // Close modal on backdrop click
    settingsModal.addEventListener("click", (e) => {
      if (e.target === settingsModal) {
        settingsModal.classList.add("hidden");
      }
    });

    // Close modal on escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        settingsModal.classList.add("hidden");
      }
    });
  }
}
