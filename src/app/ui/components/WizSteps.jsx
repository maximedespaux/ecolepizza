import { Icon } from "./Icon.jsx";

/** Barre de progression pas-à-pas partagée par les assistants (empâtement / garniture / réalisation). */
export default function WizSteps({ steps, step, setStep }) {
  return (
    <div className="wiz-steps">
      {steps.map((s, i) => (
        <button key={s.key} className={"wiz-dot" + (i === step ? " on" : "") + (i < step ? " done" : "")} onClick={() => setStep(i)} title={s.label}>
          <span className="wiz-dot-n">{i < step ? <Icon name="check" size={13} /> : s.n}</span>
          <span className="wiz-dot-l">{s.label}</span>
        </button>
      ))}
    </div>
  );
}
