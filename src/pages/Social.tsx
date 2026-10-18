import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { call, decodePresence, rankOf, toast, useCmd, useLookups } from "../lib";
import { Page, Q, Rank } from "../ui";

export const LOOP: Record<string, string> = { MENUS: "In menus", PREGAME: "Agent select", INGAME: "In a match" };

/** Readable name for a chat conversation: the friend for direct messages, the room for group chats. */
export function useConversationName() {
  const f = useCmd("valorant_friends", undefined, { refetchInterval: 15000, retry: false });
  const byPid: Record<string, string> = Object.fromEntries((f.data?.friends ?? []).flatMap((x: any) => [[x.pid, x.game_name], [x.puuid, x.game_name]]));
  return (c: any) => {
    if (c.type === "chat") return byPid[c.cid] ?? byPid[c.cid.split("@")[0]] ?? c.game_name ?? "Direct message";
    if (c.cid.includes("ares-parties")) return "Party";
    if (c.cid.includes("ares-pregame")) return "Agent select";
    if (c.cid.includes("ares-coregame")) return c.cid.includes("team") ? "Team" : "Match";
    return "Group chat";
  };
}

export function Friends() {
  const qc = useQueryClient();
  const f = useCmd("valorant_friends", undefined, { refetchInterval: 15000 });
  const party = useCmd("valorant_party", undefined, { retry: false });
  const L = useLookups();
  const [add, setAdd] = useState("");
  const run = (p: Promise<unknown>, ok: string) =>
    p.then(() => { toast(ok); qc.invalidateQueries(); }).catch((e) => toast(String(e), "error"));

  return (
    <Page title="Friends">
      <form className="row" onSubmit={(e) => {
        e.preventDefault();
        const [name, tag] = add.split("#");
        if (name && tag) run(call("valorant_send_friend_request", { name, tag }), "Friend request sent");
        else toast("Use the format Name#TAG", "error");
      }}>
        <input placeholder="Add a friend: Name#TAG" value={add} onChange={(e) => setAdd(e.target.value)} />
        <button>Send request</button>
      </form>
      <Requests run={run} />
      <Q q={f}>{(d) => {
        const pres = Object.fromEntries((d.presences ?? []).filter((p: any) => p.product === "valorant").map((p: any) => [p.puuid, decodePresence(p)]));
        const sorted = [...d.friends].sort((a: any, b: any) => Number(!!pres[b.puuid]) - Number(!!pres[a.puuid]) || a.game_name.localeCompare(b.game_name));
        const online = sorted.filter((x: any) => pres[x.puuid]).length;
        return (<>
          <h3>{online} of {sorted.length} playing VALORANT</h3>
          <div className="list">
            {sorted.map((fr: any) => {
              const p = pres[fr.puuid];
              return (
                <div className={`match-row friend ${p ? "online" : ""}`} key={fr.puuid}>
                  <span className={`dot ${p ? "on" : ""}`} />
                  <span className="grow">{fr.game_name}<span className="muted">#{fr.game_tag}</span></span>
                  <span className="muted">{p ? `${LOOP[p.loop] ?? "Online"}${p.map && p.loop !== "MENUS" ? ` · ${L.map(p.map)?.displayName ?? ""}` : ""}` : "Offline"}</span>
                  {p && party.data && <button onClick={() => run(call("valorant_invite_to_party", { partyId: party.data.ID, name: fr.game_name, tag: fr.game_tag }), `Invited ${fr.game_name}`)}>Invite</button>}
                  {p?.partyId && <button onClick={() => run(call("valorant_party_request_join", { partyId: p.partyId }), "Asked to join")}>Ask to join</button>}
                </div>
              );
            })}
          </div>
        </>);
      }}</Q>
    </Page>
  );
}

function Requests({ run }: { run: (p: Promise<unknown>, ok: string) => void }) {
  const r = useCmd("valorant_friend_requests", undefined, { refetchInterval: 30000, retry: false });
  const incoming = (r.data?.requests ?? []).filter((x: any) => x.subscription === "pending_in");
  if (!incoming.length) return null;
  return (<>
    <h3>Friend requests</h3>
    <div className="list">
      {incoming.map((x: any) => (
        <div className="match-row" key={x.puuid}>
          <span className="grow">{x.game_name}<span className="muted">#{x.game_tag}</span></span>
          <button className="primary" onClick={() => run(call("valorant_send_friend_request", { name: x.game_name, tag: x.game_tag }), `${x.game_name} added`)}>Accept</button>
          <button onClick={() => run(call("valorant_decline_friend_request", { puuid: x.puuid }), "Request declined")}>Decline</button>
        </div>
      ))}
    </div>
  </>);
}

/* ---------- party ---------- */
export function Party() {
  const qc = useQueryClient();
  const ov = useCmd("valorant_overview", undefined, { retry: false });
  const party = useCmd("valorant_party", undefined, { refetchInterval: 5000, retry: false });
  const members: any[] = party.data?.Members ?? [];
  const names = useCmd("valorant_names", { puuids: members.map((m) => m.Subject) }, { enabled: members.length > 0, staleTime: 60000 });
  const [invite, setInvite] = useState("");
  const me = members.find((m) => m.Subject === ov.data?.puuid);
  const run = (p: Promise<unknown>, ok: string) => p.then(() => { toast(ok); qc.invalidateQueries({ queryKey: ["valorant_party"] }); }).catch((e) => toast(String(e), "error"));
  return (
    <Page title="Party" sub={party.data ? `${members.length} of 5 · ${party.data.Accessibility === "OPEN" ? "open party" : "invite only"}${party.data.MatchmakingData?.QueueID ? ` · ${party.data.MatchmakingData.QueueID}` : ""}` : undefined}>
      <Q q={party}>{(p) => (<>
        <div className="party">
          {members.map((m) => {
            const n = (names.data ?? []).find((x: any) => x.Subject === m.Subject);
            return <Member key={m.Subject} m={m} name={n ? `${n.GameName}#${n.TagLine}` : ""} canKick={!!me?.IsOwner && m.Subject !== me.Subject}
              onKick={() => run(call("valorant_party_kick", { puuid: m.Subject }), "Removed from party")} />;
          })}
          {Array.from({ length: Math.max(0, 5 - members.length) }, (_, i) => <div key={i} className="member empty" aria-hidden="true" />)}
        </div>
        <form className="row" onSubmit={(e) => {
          e.preventDefault();
          const [name, tag] = invite.split("#");
          if (!name || !tag) return toast("Use the format Name#TAG", "error");
          run(call("valorant_invite_to_party", { partyId: p.ID, name, tag }), `Invited ${name}`);
          setInvite("");
        }}>
          <input placeholder="Invite: Name#TAG" value={invite} onChange={(e) => setInvite(e.target.value)} />
          <button disabled={members.length >= 5}>Invite</button>
        </form>
      </>)}</Q>
    </Page>
  );
}

function Member({ m, name, canKick, onKick }: { m: any; name: string; canKick: boolean; onKick: () => void }) {
  const mmr = useCmd("valorant_scout_player", { puuid: m.Subject }, { staleTime: 300000, retry: false });
  const r = rankOf(mmr.data);
  const card = m.PlayerIdentity?.PlayerCardID;
  return (
    <div className="member" style={card ? { "--art": `url(https://media.valorant-api.com/playercards/${card}/largeart.png)` } as React.CSSProperties : undefined}>
      <div className="member-body">
        <span className="eyebrow">{m.IsOwner ? "Leader" : m.IsReady ? "Ready" : "Not ready"}</span>
        <b>{name.split("#")[0] || "Player"}</b>
        <span className="muted mono">#{name.split("#")[1] ?? "—"} · Lv {m.PlayerIdentity?.AccountLevel ?? "?"}</span>
        <Rank tier={r.tier} />
        {canKick && <button onClick={onKick}>Remove</button>}
      </div>
    </div>
  );
}

/* ---------- chat ---------- */
export function Chat() {
  const convs = useCmd("valorant_chat_conversations", undefined, { refetchInterval: 8000 });
  const nameOf = useConversationName();
  const [cid, setCid] = useState<string>();
  const list: any[] = convs.data?.conversations ?? [];
  const current = list.find((c) => c.cid === cid);
  return (
    <Page title="Chat">
      <div className="split">
        <Q q={convs}>{() => (
          <div className="list convs">
            {!list.length && <p className="muted">No conversations yet.</p>}
            {[...list].sort((a, b) => Number(b.unread_count > 0) - Number(a.unread_count > 0)).map((c) => (
              <button key={c.cid} className={`match-row ${c.cid === cid ? "active" : ""}`} onClick={() => setCid(c.cid)}>
                <span className="grow">{nameOf(c)}</span>
                {c.unread_count > 0 && <span className="badge">{c.unread_count}</span>}
              </button>
            ))}
          </div>
        )}</Q>
        {current ? <Conversation cid={current.cid} title={nameOf(current)} /> : <div className="card chat-empty"><p className="muted">Pick a conversation to read and reply.</p></div>}
      </div>
    </Page>
  );
}

function Conversation({ cid, title }: { cid: string; title: string }) {
  const ov = useCmd("valorant_overview", undefined, { retry: false });
  const msgs = useCmd("valorant_chat_history", { cid }, { refetchInterval: 3000 });
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const sorted: any[] = [...(msgs.data?.messages ?? [])].sort((a, b) => Number(a.time) - Number(b.time));
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [sorted.length]);
  const send = () => {
    if (!text.trim()) return;
    call("valorant_send_message", { cid, message: text.trim() }).then(() => { setText(""); msgs.refetch(); }).catch((e) => toast(String(e), "error"));
  };
  return (
    <div className="card chat">
      <h2 className="chat-title">{title}</h2>
      <Q q={msgs}>{() => (
        <div className="messages" aria-live="polite">
          {sorted.map((m, i) => {
            const prev = sorted[i - 1];
            // Consecutive messages from the same person within 5 minutes form one group.
            const first = !prev || prev.puuid !== m.puuid || Number(m.time) - Number(prev.time) > 300000;
            const mine = m.puuid === ov.data?.puuid;
            return (
              <div key={m.id} className={`msg ${mine ? "mine" : ""} ${first ? "first" : ""}`}>
                {first && <div className="msg-head"><b>{mine ? "You" : m.game_name}</b><span className="muted mono">{new Date(Number(m.time)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>}
                <p>{m.body}</p>
              </div>
            );
          })}
          <div ref={end} />
        </div>
      )}</Q>
      <form className="row" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input className="grow" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${title}`} aria-label="Message" />
        <button disabled={!text.trim()}>Send</button>
      </form>
    </div>
  );
}
