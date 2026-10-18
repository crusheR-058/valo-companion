import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { call, decodePresence, toast, useCmd } from "../lib";
import { Page, Q } from "../ui";

const LOOP: Record<string, string> = { MENUS: "In menus", PREGAME: "Agent select", INGAME: "In a match" };

export function Friends() {
  const qc = useQueryClient();
  const f = useCmd("valorant_friends", undefined, { refetchInterval: 15000 });
  const party = useCmd("valorant_party");
  const [add, setAdd] = useState("");
  const run = (p: Promise<unknown>, ok: string) =>
    p.then(() => { toast(ok); qc.invalidateQueries(); }).catch((e) => toast(String(e), "error"));

  return (
    <Page title="Friends">
      <form className="row" onSubmit={(e) => {
        e.preventDefault();
        const [name, tag] = add.split("#");
        if (name && tag) run(call("valorant_send_friend_request", { name, tag }), "Request sent");
      }}>
        <input placeholder="Add friend: Name#TAG" value={add} onChange={(e) => setAdd(e.target.value)} />
        <button>Add</button>
      </form>
      <Requests run={run} />
      <Q q={f}>{(d) => {
        const pres = Object.fromEntries((d.presences ?? []).filter((p: any) => p.product === "valorant").map((p: any) => [p.puuid, decodePresence(p)]));
        const sorted = [...d.friends].sort((a: any, b: any) => Number(!!pres[b.puuid]) - Number(!!pres[a.puuid]));
        return (
          <div className="list">
            {sorted.map((fr: any) => {
              const p = pres[fr.puuid];
              return (
                <div className={`match-row friend fx ${p ? "online" : ""}`} key={fr.puuid}>
                  <span className={`dot ${p ? "on" : ""}`} />
                  <span className="grow">{fr.game_name}<span className="muted">#{fr.game_tag}</span></span>
                  <span className="muted">{p ? LOOP[p.loop] ?? "Online" : "Offline"}</span>
                  {p && party.data && <button onClick={() => run(call("valorant_invite_to_party", { partyId: party.data.ID, name: fr.game_name, tag: fr.game_tag }), "Invite sent")}>Invite</button>}
                  {p?.partyId && <button onClick={() => run(call("valorant_party_request_join", { partyId: p.partyId }), "Join request sent")}>Ask to join</button>}
                </div>
              );
            })}
          </div>
        );
      }}</Q>
    </Page>
  );
}

function Requests({ run }: { run: (p: Promise<unknown>, ok: string) => void }) {
  const r = useCmd("valorant_friend_requests", undefined, { refetchInterval: 30000 });
  const incoming = (r.data?.requests ?? []).filter((x: any) => x.subscription === "pending_in");
  if (!incoming.length) return null;
  return (
    <div className="card">
      <h3>Friend requests</h3>
      {incoming.map((x: any) => (
        <div className="match-row" key={x.puuid}>
          <span className="grow">{x.game_name}#{x.game_tag}</span>
          <button onClick={() => run(call("valorant_send_friend_request", { name: x.game_name, tag: x.game_tag }), "Accepted")}>Accept</button>
          <button onClick={() => run(call("valorant_decline_friend_request", { puuid: x.puuid }), "Declined")}>Decline</button>
        </div>
      ))}
    </div>
  );
}

export function Chat() {
  const convs = useCmd("valorant_chat_conversations", undefined, { refetchInterval: 10000 });
  const [cid, setCid] = useState<string>();
  return (
    <Page title="Chat">
      <div className="split">
        <Q q={convs}>{(d) => (
          <div className="list">
            {d.conversations.map((c: any) => (
              <button key={c.cid} className={`match-row ${c.cid === cid ? "active" : ""}`} onClick={() => setCid(c.cid)}>
                <span className="grow">{c.type === "chat" ? c.cid.split("@")[0].slice(0, 8) : c.type}</span>
                {c.unread_count > 0 && <span className="badge">{c.unread_count}</span>}
              </button>
            ))}
          </div>
        )}</Q>
        {cid ? <Conversation cid={cid} /> : <p className="muted">Pick a conversation.</p>}
      </div>
    </Page>
  );
}

function Conversation({ cid }: { cid: string }) {
  const msgs = useCmd("valorant_chat_history", { cid }, { refetchInterval: 3000 });
  const [text, setText] = useState("");
  return (
    <div className="card chat">
      <Q q={msgs}>{(d) => (
        <div className="messages">
          {[...d.messages].sort((a: any, b: any) => Number(a.time) - Number(b.time)).map((m: any) => (
            <p key={m.id}><b>{m.game_name}</b> {m.body}</p>
          ))}
        </div>
      )}</Q>
      <form className="row" onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        call("valorant_send_message", { cid, message: text }).then(() => { setText(""); msgs.refetch(); }).catch((e) => toast(String(e), "error"));
      }}>
        <input className="grow" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" />
        <button>Send</button>
      </form>
    </div>
  );
}
