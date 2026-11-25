import type { EventBleachers } from "../hooks/useEventsBleachers";

/** What one event needs and what has been picked for it: required bleachers, then selected ones. */
export function EventDetails({ bleachers }: { bleachers: EventBleachers }) {
  const { required, selected } = bleachers;

  return (
    <div className="grid gap-6 pb-4 sm:grid-cols-2" data-testid="event-details">
      <section>
        <h3 className="mb-1 text-sm font-semibold">Required Bleachers</h3>
        {required.length === 0 ? (
          <p className="text-sm text-gray-500">None required.</p>
        ) : (
          <ul className="text-sm">
            {required.map((r) => (
              <li key={r.typeId}>
                {r.quantity} × {r.typeName}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold">Selected Bleachers</h3>
        {selected.length === 0 ? (
          <p className="text-sm text-gray-500">None selected.</p>
        ) : (
          <ul className="text-sm">
            {selected.map((b) => (
              <li key={b.bleacherUuid}>
                #{b.bleacherNumber} · {b.typeName ?? "No type"} · {b.seats} seats
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
