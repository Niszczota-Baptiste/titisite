import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useWorkspace } from '../../hooks/useWorkspace';
import { CalendarExportButton } from './CalendarExport';
import { FeatureModal } from './FeatureModal';
import { MeetingModal } from './MeetingModal';
import {
  ACC, ACC_RGB, Button, DUE_STYLES, ErrorBanner, Section,
  card, muted, toLocalDatetimeInput,
} from './shared';

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export function CalendarTab() {
  const { workspace } = useWorkspace();
  const ws = api.ws(workspace.slug);
  const mobile = useIsMobile(720);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [meetings, setMeetings] = useState([]);
  const [features, setFeatures] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [meetingEditing, setMeetingEditing] = useState(null);
  const [featureEditing, setFeatureEditing] = useState(null);

  const load = async () => {
    try {
      const [m, f, u] = await Promise.all([ws.meetings.list(), ws.features.list(), api.users()]);
      setMeetings(m); setFeatures(f); setUsers(u);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [workspace.slug]);

  const cells = useMemo(() => buildMonthGrid(cursor), [cursor]);

  const eventsByDay = useMemo(() => {
    const map = {};
    const push = (key, ev) => { (map[key] ||= []).push(ev); };
    for (const m of meetings) {
      if (!m.startsAt) continue;
      push(dayKey(new Date(m.startsAt * 1000)), { type: 'meeting', ts: m.startsAt, data: m });
    }
    for (const f of features) {
      if (!f.dueDate) continue;
      push(dayKey(new Date(f.dueDate * 1000)), { type: 'feature', ts: f.dueDate, data: f });
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.ts - b.ts);
    return map;
  }, [meetings, features]);

  const monthLabel = cursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const shift = (d) => { const n = new Date(cursor); n.setMonth(n.getMonth() + d); setCursor(n); };
  const goToday = () => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); };

  return (
    <Section
      title="Calendrier"
      actions={
        <>
          <CalendarExportButton compact />
          <Button variant="ghost" onClick={() => shift(-1)}>←</Button>
          <Button variant="ghost" onClick={goToday}>Aujourd'hui</Button>
          <Button variant="ghost" onClick={() => shift(+1)}>→</Button>
          <Button onClick={() => setMeetingEditing({})}>+ Réunion</Button>
        </>
      }
    >
      <ErrorBanner error={err} onDismiss={() => setErr(null)} />

      <div style={{
        fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 600,
        color: '#ede8f8', textTransform: 'capitalize', marginBottom: 12,
      }}>{monthLabel}</div>

      {loading ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : mobile ? (
        <MobileAgenda
          cells={cells}
          eventsByDay={eventsByDay}
          onMeeting={(m) => setMeetingEditing(m)}
          onFeature={(f) => setFeatureEditing(f)}
          onAddMeetingHere={(d) =>
            setMeetingEditing({
              defaultStart: toLocalDatetimeInput(Math.floor(atNineAM(d) / 1000)),
            })
          }
        />
      ) : (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(7,1fr)',
            borderBottom: '1px solid rgba(60,40,100,0.2)',
          }}>
            {DAY_LABELS.map((l) => (
              <div key={l} style={{
                padding: '8px 10px',
                fontFamily: "'Inter',sans-serif", fontSize: 10.5,
                color: 'rgba(180,170,200,0.55)', letterSpacing: '1px',
                textTransform: 'uppercase', fontWeight: 700,
              }}>{l}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
            {cells.map((cell, i) => {
              const key = dayKey(cell.date);
              const events = eventsByDay[key] || [];
              return (
                <DayCell
                  key={i}
                  cell={cell}
                  events={events}
                  onMeeting={(m) => setMeetingEditing(m)}
                  onFeature={(f) => setFeatureEditing(f)}
                  onAddMeetingHere={() =>
                    setMeetingEditing({
                      defaultStart: toLocalDatetimeInput(Math.floor(atNineAM(cell.date) / 1000)),
                    })
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      <MeetingModal
        open={!!meetingEditing}
        meeting={meetingEditing && meetingEditing.id ? meetingEditing : null}
        defaultStart={meetingEditing?.defaultStart}
        workspaceSlug={workspace.slug}
        onClose={() => setMeetingEditing(null)}
        onSaved={() => { setMeetingEditing(null); load(); }}
      />

      <FeatureModal
        open={!!featureEditing}
        feature={featureEditing}
        users={users}
        workspaceSlug={workspace.slug}
        onClose={() => setFeatureEditing(null)}
        onSaved={() => { setFeatureEditing(null); load(); }}
      />
    </Section>
  );
}

function DayCell({ cell, events, onMeeting, onFeature, onAddMeetingHere }) {
  const { date, inMonth, isToday } = cell;
  return (
    <div style={{
      minHeight: 110, padding: 6,
      borderRight: '1px solid rgba(60,40,100,0.12)',
      borderBottom: '1px solid rgba(60,40,100,0.12)',
      background: isToday ? `rgba(${ACC_RGB},0.05)` : 'transparent',
      opacity: inMonth ? 1 : 0.4,
      display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600,
          color: isToday ? ACC : '#ede8f8',
        }}>{date.getDate()}</span>
        {inMonth && (
          <button
            onClick={onAddMeetingHere}
            title="Ajouter une réunion ce jour"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(180,170,200,0.3)', fontSize: 13, padding: 0, lineHeight: 1,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = ACC)}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(180,170,200,0.3)')}
          >+</button>
        )}
      </div>
      {events.slice(0, 4).map((ev, i) => (
        <EventChip key={i} ev={ev} onMeeting={onMeeting} onFeature={onFeature} />
      ))}
      {events.length > 4 && (
        <span style={{ ...muted, fontSize: 10 }}>+ {events.length - 4}</span>
      )}
    </div>
  );
}

function EventChip({ ev, onMeeting, onFeature }) {
  if (ev.type === 'meeting') {
    const time = new Date(ev.ts * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return (
      <button
        onClick={() => onMeeting(ev.data)}
        style={{
          ...chipStyle,
          background: `rgba(${ACC_RGB},0.12)`,
          border: `1px solid rgba(${ACC_RGB},0.3)`,
          color: ACC,
        }}
        title={ev.data.title}
      >
        <span style={{ fontFamily: 'monospace', opacity: 0.8, marginRight: 4 }}>{time}</span>
        {truncate(ev.data.title, 18)}
      </button>
    );
  }
  const due = ev.data.status === 'done' ? 'done' : (ev.data.dueDate < Date.now() / 1000 ? 'overdue' : 'upcoming');
  const s = DUE_STYLES[due] || DUE_STYLES.upcoming;
  return (
    <button
      onClick={() => onFeature(ev.data)}
      style={{
        ...chipStyle,
        background: s.bg,
        border: `1px solid ${s.color}33`,
        color: s.color,
      }}
      title={`${ev.data.title} — ${s.label}`}
    >
      <span style={{ marginRight: 4 }}>{due === 'overdue' ? '⚠' : '📌'}</span>
      {truncate(ev.data.title, 18)}
    </button>
  );
}

const chipStyle = {
  display: 'block', width: '100%',
  padding: '3px 6px', borderRadius: 4,
  fontSize: 10.5, fontFamily: "'Inter',sans-serif", fontWeight: 500,
  textAlign: 'left', cursor: 'pointer',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

function MobileAgenda({ cells, eventsByDay, onMeeting, onFeature, onAddMeetingHere }) {
  const days = cells.filter((c) => c.inMonth);
  return (
    <div style={{ ...card, padding: 4, overflow: 'hidden' }}>
      {days.map((cell) => {
        const key = dayKey(cell.date);
        const events = eventsByDay[key] || [];
        const weekday = cell.date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
        const isToday = cell.isToday;
        return (
          <div
            key={key}
            style={{
              display: 'flex', gap: 12, padding: '10px 8px',
              borderBottom: '1px solid rgba(60,40,100,0.12)',
              background: isToday ? `rgba(${ACC_RGB},0.05)` : 'transparent',
              minHeight: 56,
            }}
          >
            <div style={{
              width: 44, flexShrink: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'flex-start',
              paddingTop: 2,
            }}>
              <span style={{
                fontFamily: 'monospace', fontSize: 9.5,
                color: isToday ? ACC : 'rgba(180,170,200,0.55)',
                textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 700,
              }}>{weekday}</span>
              <span style={{
                fontFamily: "'Space Grotesk',sans-serif",
                fontSize: 20, fontWeight: 700,
                color: isToday ? ACC : '#ede8f8', lineHeight: 1.1,
              }}>{cell.date.getDate()}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {events.length === 0 ? (
                <button
                  onClick={() => onAddMeetingHere(cell.date)}
                  style={{
                    background: 'none', border: '1px dashed rgba(80,50,130,0.25)',
                    borderRadius: 6, padding: '7px 10px',
                    color: 'rgba(180,170,200,0.4)',
                    fontFamily: "'Inter',sans-serif", fontSize: 11.5,
                    textAlign: 'left', cursor: 'pointer',
                  }}
                >
                  + Ajouter une réunion
                </button>
              ) : (
                events.map((ev, i) => (
                  <EventChip key={i} ev={ev} onMeeting={onMeeting} onFeature={onFeature} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function atNineAM(d) { const n = new Date(d); n.setHours(9, 0, 0, 0); return n.getTime(); }
function buildMonthGrid(cursor) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const firstWeekday = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - firstWeekday);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push({
      date: d,
      inMonth: d.getMonth() === month,
      isToday: d.getTime() === today.getTime(),
    });
  }
  return out;
}
