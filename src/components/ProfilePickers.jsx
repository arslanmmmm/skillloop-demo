import { GRADES, SUBJECTS } from '../config/subjects.js'

// Shared by onboarding and the profile editor.

export function GradePicker({ value, onChange }) {
  return (
    <fieldset className="chip-set grade-set">
      <legend>Grade</legend>
      {GRADES.map((item) => (
        <label key={item} className="chip">
          <input
            type="radio"
            name="grade"
            value={item}
            checked={value === item}
            onChange={() => onChange(item)}
          />
          {item}
        </label>
      ))}
    </fieldset>
  )
}

// `locked` subjects are shown greyed out, e.g. ones you teach on the "need help" list.
export function SubjectPicker({ legend, selected, onToggle, locked = [], lockedTitle }) {
  return (
    <fieldset className="chip-set">
      <legend>{legend}</legend>
      {SUBJECTS.map((subject) => {
        const isLocked = locked.includes(subject)
        return (
          <label key={subject} className="chip" title={isLocked ? lockedTitle : undefined}>
            <input
              type="checkbox"
              disabled={isLocked}
              checked={selected.includes(subject)}
              onChange={() => onToggle(subject)}
            />
            {subject}
          </label>
        )
      })}
    </fieldset>
  )
}
