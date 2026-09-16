"use client";

import { useRef, useState } from "react";
import { Plus, X, Check, Search, ChevronDown, ChartNoAxesColumnIncreasing, Tags, Podcast, Layers3, AudioLines, ImageUp, Upload, LoaderCircle, Sparkles, Cpu, Laptop, Bitcoin, Globe, Building2, Leaf, HeartPulse, Banknote } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import type { AppDestination } from "@/components/app-sidebar";
import { Notice } from "@/components/notice";
import { INTERESTS, POPULAR_ASSETS, conceptKey, matchAsset, matchInterest, searchAssets, searchInterests } from "@/lib/onboarding";

type Holding = { id: string; ticker: string; name: string; quantity: string; avgCost: string };

function topicPresentation(id: string) {
  const topics: Record<string, { icon: typeof Cpu; title: string; detail: string }> = {
    AI: {icon:Cpu,title:"בינה מלאכותית",detail:"חברות AI, מודלים והתפתחויות חדשות"},
    "טכנולוגיה": {icon:Laptop,title:"טכנולוגיה",detail:"חדשנות, תוכנה וחברות טכנולוגיה"},
    "קריפטו": {icon:Bitcoin,title:"קריפטו",detail:"מטבעות דיגיטליים ובלוקצ׳יין"},
    "כלכלת ישראל": {icon:Globe,title:"כלכלת ישראל",detail:"המשק הישראלי והאירועים שמשפיעים עליו"},
    "כלכלה עולמית": {icon:Globe,title:"כלכלה עולמית",detail:"התפתחויות כלכליות ברחבי העולם"},
    "שוק הנדל״ן": {icon:Building2,title:"שוק הנדל״ן",detail:"שוק הדיור, נדל״ן והשקעות"},
    "אנרגיה": {icon:Leaf,title:"אנרגיה",detail:"נפט, גז ואנרגיות מתחדשות"},
    "ביוטק ופארמה": {icon:HeartPulse,title:"ביוטק ופארמה",detail:"בריאות, תרופות וטכנולוגיות רפואיות"},
    "ריבית ואינפלציה": {icon:Banknote,title:"ריבית ואינפלציה",detail:"מחירים, ריבית ומדיניות כלכלית"}
  };
  return topics[id] ?? {icon:Tags,title:id,detail:"עדכונים וחדשות בנושא שמעניין אותך"};
}

export function TrackingPage({ holdings, interests, onSave, onNav, onSignOut, onPreferences, email, plan }: {
  holdings: Holding[]; interests: string[];
  onNav: (screen: AppDestination) => void; onSignOut: () => void; onPreferences: () => void; email: string | null; plan: "daily" | "weekly";
  onSave: (h: Holding[], interests: string[]) => Promise<void>;
}) {
  const [rows, setRows] = useState<Holding[]>(holdings);
  const predefinedIds = interests.filter((id) => INTERESTS.some((i) => i.id === id));
  const initialCustom = interests.filter((id) => !INTERESTS.some((i) => i.id === id));
  const [selectedInterests, setSelectedInterests] = useState<string[]>(predefinedIds);
  const [customInterests, setCustomInterests] = useState<string[]>(initialCustom);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<"all" | "assets" | "interests">("all");
  const searchRef = useRef<HTMLInputElement>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "analyzing" | "detected" | "error">("idle");
  const [uploadError, setUploadError] = useState("");
  const [detectedAssets, setDetectedAssets] = useState<{ ticker: string; name: string }[]>([]);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function removeHolding(id: string) { setRows(rows.filter((h) => h.id !== id)); }
  function addFromPicker(ticker: string, name: string) {
    if (!rows.find((h) => h.ticker === ticker)) setRows([...rows, { id: crypto.randomUUID(), ticker, name, quantity: "", avgCost: "" }]);
  }
  function toggleInterest(id: string) { setSelectedInterests((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])); }
  function addCustomInterest(value = searchQuery) {
    const v = matchInterest(value) ?? value.trim();
    if (!v) return;
    if (INTERESTS.some((i) => i.id === v)) {
      setSelectedInterests((prev) => prev.includes(v) ? prev : [...prev, v]);
    } else if (![...selectedInterests, ...customInterests].some((i) => conceptKey(i) === conceptKey(v))) {
      setCustomInterests((prev) => [...prev, v]);
    }
    setSearchQuery("");
  }
  function removeCustomInterest(v: string) { setCustomInterests((p) => p.filter((x) => x !== v)); }
  async function save() {
    setSaved("saving");
    try {
      await onSave(rows.filter((h) => h.ticker.trim()), [...selectedInterests, ...customInterests]);
      setSaved("saved"); setTimeout(() => setSaved("idle"), 2000);
    } catch { setSaved("error"); }
  }

  const searchResults = searchQuery.trim() ? searchAssets(searchQuery) : POPULAR_ASSETS.slice(0, 6);
  const interestResults = searchQuery.trim() ? searchInterests(searchQuery) : INTERESTS;
  const trackedInterests = [...selectedInterests, ...customInterests];
  const q = conceptKey(searchQuery);
  const visibleRows = rows.filter((h) => !q || conceptKey(h.ticker + h.name).includes(q) || searchResults.some((a) => a.ticker === h.ticker));
  const visibleInterests = trackedInterests.filter((i) => !q || conceptKey(i).includes(q) || searchInterests(searchQuery).some((s) => s.id === i));
  function openAdd() {
    setPickerOpen(true);
    searchRef.current?.focus();
  }

  async function handleFileSelect(file: File) {
    setUploadFile(file);
    setUploadState("analyzing");
    setUploadError("");
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const r = await fetch("/api/portfolio/parse-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageDataUrl: dataUrl }) });
      const data = (await r.json()) as { assets?: { symbol: string; name: string }[]; error?: string };
      if (!r.ok) throw new Error(data.error || "ניתוח הצילום נכשל.");
      const assets = (data.assets ?? []).map((a) => ({ ticker: a.symbol, name: a.name }));
      setDetectedAssets(assets);
      if (assets.length) setUploadState("detected");
      else { setUploadState("error"); setUploadError("לא זיהינו נכסים בתמונה."); }
    } catch (e) {
      setUploadState("error");
      setUploadError(e instanceof Error ? e.message : "ניתוח הצילום נכשל.");
    }
  }

  function confirmDetected() {
    const toAdd = detectedAssets.filter((a) => !rows.find((h) => h.ticker === a.ticker));
    setRows([...rows, ...toAdd.map((a) => ({ id: crypto.randomUUID(), ticker: a.ticker, name: a.name, quantity: "", avgCost: "" }))]);
    setUploadState("idle"); setUploadFile(null); setDetectedAssets([]);
  }


  return <div className="today-shell tracking-shell" dir="ltr">
    <AppSidebar active="settings-portfolio" email={email} plan={plan} onNav={onNav} onPreferences={onPreferences} onSignOut={onSignOut}/>
    <main className="today-content tracking-content" dir="rtl">
      <section className="tracking-hero" aria-labelledby="tracking-title">
        <div><h1 id="tracking-title">המעקב שלי</h1><h2>כאן מנהלים את הנכסים, הנושאים והתחומים שמעניינים אותך</h2><p>כל מה שחשוב לפודקאסט האישי שלך — במקום אחד.</p></div>
        <button className="today-primary" onClick={openAdd}><Plus size={22}/>הוסף נכס או נושא</button>
      </section>
      <section className="tracking-stats" aria-label="סיכום המעקב">
        {[{icon:ChartNoAxesColumnIncreasing,value:rows.length,label:"נכסים במעקב",detail:"מניות, קרנות, מדדים וקריפטו"},
          {icon:Tags,value:trackedInterests.length,label:"תחומי עניין במעקב",detail:"הנושאים שמעצבים את הפודקאסט שלך"},
          {icon:Podcast,value:plan === "daily" ? "יומי" : "שבועי",label:"תוכנית הפודקאסט",detail:"תוכן מותאם לפי הבחירות שלך"},
          {icon:Layers3,value:rows.length + trackedInterests.length,label:"פריטים במעקב",detail:"נכסים ותחומי עניין, יחד"}].map(({icon:Icon,value,label,detail}) =>
          <article className="today-card tracking-stat" key={label}><Icon size={32}/><div><strong>{value}</strong><h3>{label}</h3><small>{detail}</small></div></article>)}
      </section>
      <div className="tracking-controls">
        <div className="tracking-tabs" role="group" aria-label="סוג הפריטים">
          {[{id:"all" as const,label:"הכל"},{id:"assets" as const,label:"נכסים"},{id:"interests" as const,label:"תחומי עניין"}].map((tab)=>
            <button key={tab.id} aria-pressed={category===tab.id} className={category===tab.id?"selected":""} onClick={()=>setCategory(tab.id)}>{tab.label}</button>)}
        </div>
        <label className="tracking-search"><Search size={20}/><input ref={searchRef} aria-label="חיפוש נכס, נושא או תחום עניין" placeholder="חיפוש נכס, נושא או תחום עניין..." value={searchQuery} onChange={(e)=>{setSearchQuery(e.target.value);setPickerOpen(true);}} onKeyDown={(e)=>{if(e.key==="Escape"){setSearchQuery("");setPickerOpen(false);}}}/>{searchQuery && <button aria-label="ניקוי החיפוש" onClick={()=>setSearchQuery("")}><X size={16}/></button>}</label>
        <button className="tracking-add-toggle" aria-expanded={pickerOpen} onClick={()=>setPickerOpen((v)=>!v)}><Plus size={18}/>הוספה מהרשימה<ChevronDown size={16}/></button>
      </div>
      {pickerOpen && <section className="today-card tracking-picker" aria-label="הוספת נכסים ותחומי עניין">
        <div className="tracking-section-title"><h2>הוסף נכס או נושא</h2><button aria-label="סגירת הצעות ההוספה" onClick={()=>setPickerOpen(false)}><X size={18}/></button></div>
        <div className="tracking-suggestions">
          {category!=="interests" && <div><h3>נכסים · מניות, ETF, קריפטו ומדדים</h3><div className="tracking-suggestion-list">{searchResults.map((a)=>{const added=rows.some((h)=>h.ticker===a.ticker);return <button key={a.ticker} disabled={added} onClick={()=>addFromPicker(a.ticker,a.nameHe??a.name)}><span><bdi dir="auto">{a.nameHe??a.name}</bdi><small><bdi dir="ltr">{a.ticker}</bdi></small></span>{added?<Check size={18}/>:<Plus size={18}/>}</button>;})}</div>{!searchResults.length && <p>לא נמצאו נכסים ברשימה. אפשר לנסות שם אחר או להעלות צילום מסך.</p>}</div>}
          {category!=="assets" && <div><h3>תחומי עניין ונושאים</h3><div className="tracking-interest-suggestions">{interestResults.map((i)=><button key={i.id} aria-pressed={selectedInterests.includes(i.id)} onClick={()=>toggleInterest(i.id)}>{selectedInterests.includes(i.id)?<Check size={15}/>:<Plus size={15}/>}<bdi dir="auto">{i.label}</bdi></button>)}</div>{searchQuery.trim() && !matchAsset(searchQuery) && !trackedInterests.some((i)=>conceptKey(i)===conceptKey(matchInterest(searchQuery)??searchQuery)) && <button className="tracking-custom-add" onClick={()=>addCustomInterest()}><Plus size={16}/>הוספת ״{searchQuery.trim()}״ כתחום עניין</button>}</div>}
        </div>
      </section>}
      {category!=="interests" && <section className="tracking-section" aria-labelledby="tracking-assets-title">
        <div className="tracking-section-title"><h2 id="tracking-assets-title"><ChartNoAxesColumnIncreasing size={24}/>נכסים במעקב <small>{rows.length}</small></h2><button onClick={()=>{setCategory("assets");openAdd();}}><Plus size={16}/>הוסף נכס</button></div>
        <div className="tracking-asset-grid">{visibleRows.map((h)=>
          <article className="today-card tracking-asset" key={h.id}>
            <div className="tracking-item-heading"><span className={`tracking-symbol symbol-${h.ticker === "BTC" ? "crypto" : h.ticker === "SPY" ? "index" : "stock"}`} aria-hidden="true">{h.ticker==="BTC"?"₿":h.ticker==="SPY"?"S&P":h.ticker.replace("TASE:","").slice(0,4)}</span><div><h3><bdi dir="auto">{h.name || h.ticker}</bdi></h3><small><bdi dir="ltr">{h.ticker}</bdi></small></div><button className="tracking-remove" aria-label={`הסרת ${h.ticker}`} onClick={()=>removeHolding(h.id)}><X size={16}/></button></div>
            <div className="tracking-asset-detail"><AudioLines size={23}/><p>עדכונים רלוונטיים לנכס הזה יילקחו בחשבון בפודקאסט שלך.</p></div><span className="tracking-item-badge"><Check size={13}/>במעקב האישי שלך</span>
          </article>)}</div>
        {!visibleRows.length && <div className="today-card tracking-empty"><ChartNoAxesColumnIncreasing size={26}/><p>{rows.length?"לא נמצאו נכסים במעקב שתואמים לחיפוש.":"עדיין אין נכסים במעקב. הוסף נכס מהרשימה או מצילום מסך."}</p><button onClick={openAdd}>הוסף נכס <Plus size={16}/></button></div>}
      </section>}
      {category!=="assets" && <section className="tracking-section" aria-labelledby="tracking-interests-title">
        <div className="tracking-section-title"><h2 id="tracking-interests-title"><Tags size={24}/>תחומי עניין במעקב <small>{trackedInterests.length}</small></h2><button onClick={()=>{setCategory("interests");openAdd();}}><Plus size={16}/>הוסף נושא</button></div>
        <div className="tracking-topic-grid">{visibleInterests.map((i,index)=>{const meta=topicPresentation(i);const Icon=meta.icon;return <article className={`today-card tracking-topic tone-${index%4}`} key={i}><div className="tracking-item-heading"><Icon size={32}/><button className="tracking-remove" aria-label={`הסרת תחום עניין ${i}`} onClick={()=>selectedInterests.includes(i)?toggleInterest(i):removeCustomInterest(i)}><X size={15}/></button></div><h3><bdi dir="auto">{meta.title}</bdi></h3><p>{meta.detail}</p><span className="tracking-item-badge"><Podcast size={12}/>נושא לפודקאסט שלך</span></article>;})}</div>
        {!visibleInterests.length && <div className="today-card tracking-empty"><Tags size={26}/><p>{trackedInterests.length?"לא נמצאו תחומי עניין שתואמים לחיפוש.":"בחר נושאים שמעניינים אותך — גם בלי להוסיף נכסים."}</p><button onClick={()=>{setCategory("interests");openAdd();}}>הוסף תחום עניין <Plus size={16}/></button></div>}
      </section>}
      <div className="tracking-support">
        <section className="today-card tracking-upload" aria-labelledby="tracking-upload-title">
          <div className="tracking-upload-heading"><span><ImageUp size={28}/></span><div><h2 id="tracking-upload-title">העלאת צילום מסך</h2><p>העלה צילום מסך של הנכסים שלך כדי שנוכל לזהות אותם ולעזור לך להוסיף אותם למעקב.</p></div></div>
          <input ref={uploadRef} aria-label="בחירת צילום מסך של נכסים" type="file" accept="image/png,image/jpeg,image/jpg" hidden onChange={(e)=>{const file=e.target.files?.[0];if(file)void handleFileSelect(file);e.target.value="";}}/>
          {uploadState==="idle" && <button className={`tracking-dropzone ${dragOver?"dragging":""}`} onClick={()=>uploadRef.current?.click()} onDragOver={(e)=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={(e)=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f?.type.startsWith("image/"))void handleFileSelect(f);}}><Upload size={20}/><strong>בחר צילום מסך או גרור לכאן</strong><small>PNG, JPG או JPEG</small></button>}
          {uploadState==="analyzing" && <p className="tracking-upload-status" role="status"><LoaderCircle className="tracking-spin" size={22}/>מנתחים את צילום המסך… <bdi>{uploadFile?.name}</bdi></p>}
          {uploadState==="detected" && <div className="tracking-detected"><p>זיהינו את הנכסים הבאים — בדוק לפני ההוספה:</p><div>{detectedAssets.map((a)=><span key={a.ticker}><bdi dir="ltr">{a.ticker}</bdi> · <bdi dir="auto">{a.name}</bdi></span>)}</div><button className="today-primary" onClick={confirmDetected}><Check size={16}/>אישור והוספה</button><button className="tracking-text-button" onClick={()=>{setUploadState("idle");setUploadFile(null);setDetectedAssets([]);}}>ביטול</button></div>}
          {uploadState==="error" && <><Notice tone="error">{uploadError}</Notice><button className="tracking-text-button" onClick={()=>setUploadState("idle")}>נסה צילום מסך אחר</button></>}
        </section>
        <aside className="today-card tracking-help"><Sparkles size={30}/><h2>מעקב חכם, פודקאסט אישי</h2><p>הנכסים ותחומי העניין שבחרת עוזרים ל־VESTORY למצוא את החדשות שרלוונטיות לך.</p><p>לא מצאת נושא ברשימה? חפש אותו והוסף אותו כתחום עניין אישי.</p><button className="today-primary" onClick={()=>{setCategory("all");openAdd();}}><Plus size={18}/>הוסף נכס או נושא</button></aside>
      </div>
      <div className="tracking-save"><span>שינויים במעקב נשמרים לאחר לחיצה על שמירה.</span><button className="today-primary" onClick={()=>void save()} disabled={saved==="saving"}>{saved==="saving"?<LoaderCircle className="tracking-spin" size={17}/>:<Check size={17}/>} {saved==="saving"?"שומר…":saved==="saved"?"נשמר ✓":"שמירת שינויים"}</button></div>
      {saved==="error" && <Notice tone="error">שמירת השינויים נכשלה.</Notice>}
      {saved==="saved" && <p className="tracking-saved-message" role="status">השינויים נשמרו.</p>}
    </main>
  </div>;
}
