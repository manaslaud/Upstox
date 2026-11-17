import csv, io, json, os, threading, webbrowser
from datetime import datetime, timedelta, time, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlencode, quote, urlsplit, parse_qs
import requests
try:
    import truststore
    truststore.inject_into_ssl()
    TRUSTSTORE_ENABLED = True
except ImportError:
    TRUSTSTORE_ENABLED = False

IST=timezone(timedelta(hours=5, minutes=30))
BASE='https://api.upstox.com'
PAGE='''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scanner 3 · Upstox OHLC</title><style>body{font:16px system-ui;margin:2rem auto;max-width:1100px;padding:0 1rem;color:#172235;background:#f7f9fc}h1{font-size:1.6rem}form,.panel{background:white;border:1px solid #dce2ea;border-radius:12px;padding:18px;margin:15px 0}label{display:block;font-size:.9rem;margin-bottom:5px}input,select,button{padding:10px;border:1px solid #bdc9d6;border-radius:7px;font:inherit}input{width:100%;box-sizing:border-box}button{background:#1459ba;color:white;cursor:pointer;border:0}button:disabled{opacity:.5} .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.muted{color:#526075}.error{color:#a11616;white-space:pre-wrap}.tablewrap{overflow:auto}table{border-collapse:collapse;width:100%;background:white}th,td{padding:10px;border-bottom:1px solid #e3e7ee;text-align:right;white-space:nowrap}th:first-child,td:first-child{text-align:left}small{color:#526075}</style></head><body><h1>📈 Scanner 3 — NSE OHLC Collector</h1><p class="muted">Official Upstox API · requests + optional truststore · read-only · times in IST</p><form id="f"><div class="grid"><div><label>Upstox access token (kept in this browser tab; not saved to disk)</label><input id="token" type="password" autocomplete="off" required></div><div><label>Stock symbol or company name</label><input id="symbol" value="BECTORFOOD" required></div><div><label>Timeframe</label><select id="tf"><option value="15">15-minute</option><option value="30">30-minute</option><option value="day">Daily</option></select></div><div><label>Lookback (calendar days)</label><select id="days"><option>7</option><option>14</option><option>30</option></select></div></div><p><button id="fetch">Fetch OHLCV</button> <button type="button" id="csv" disabled>Download CSV</button></p></form><div id="status" class="muted">Enter a valid Upstox access token to begin. Token is sent only to the local server and then to Upstox.</div><div id="result"></div><script>
let last=[];const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
$('f').onsubmit=async e=>{e.preventDefault();$('fetch').disabled=true;$('csv').disabled=true;$('status').textContent='Fetching from Upstox…';$('result').innerHTML='';try{let r=await fetch('/api/ohlc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:$('token').value,symbol:$('symbol').value,tf:$('tf').value,days:Number($('days').value)})});let j=await r.json();if(!r.ok)throw Error(j.error||'Request failed');last=j.rows;$('csv').disabled=!last.length;$('status').textContent=`${j.symbol} · ${j.instrument_key} · fetched ${j.fetched} · Source: Upstox official API`;let metrics=j.latest?`<div class="panel"><h3>Latest completed candle</h3><div class="grid">${Object.entries(j.latest).map(([k,v])=>`<div><small>${esc(k)}</small><br><b>${esc(v)}</b></div>`).join('')}</div></div>`:'<p>No completed candle in range.</p>';let prev=j.previous?`<p>Previous completed trading day: ${esc(j.previous.date)} | High: ${esc(j.previous.high)} | Low: ${esc(j.previous.low)}</p>`:'';let forming=j.forming?`<p><b>Possible forming candle:</b> ${esc(j.forming.timestamp)} (not confirmed closed)</p>`:'';$('result').innerHTML=metrics+prev+forming+`<div class="panel tablewrap"><table><thead><tr>${['Time (IST)','Open','High','Low','Close','Volume','OI','Status'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${last.map(x=>`<tr>${['timestamp','open','high','low','close','volume','oi','status'].map(k=>`<td>${esc(x[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}catch(e){$('status').innerHTML='<span class="error">'+esc(e.message)+'</span>'}finally{$('fetch').disabled=false}};
$('csv').onclick=()=>{let cols=['timestamp','open','high','low','close','volume','oi','status'];let out=[cols.join(','),...last.map(x=>cols.map(k=>'"'+String(x[k]??'').replace(/"/g,'""')+'"').join(','))].join('\\r\\n');let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([out],{type:'text/csv'}));a.download='upstox_ohlcv.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
</script></body></html>'''

def api(path, token, params=None):
    url = BASE + path
    headers = {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
        'Api-Version': '2.0',
    }
    try:
        response = requests.get(url, headers=headers, params=params, timeout=(12, 30))
    except requests.exceptions.SSLError as exc:
        raise ValueError('Upstox TLS/SSL connection failed. Windows curl worked previously; requests may still be blocked by the same TLS issue. Details: ' + str(exc)) from exc
    except requests.exceptions.ConnectionError as exc:
        raise ValueError('Upstox connection failed. Requests uses Python TLS and may still encounter WinError 10054. Details: ' + str(exc)) from exc
    except requests.exceptions.Timeout as exc:
        raise ValueError('Upstox API timed out: ' + str(exc)) from exc
    except requests.exceptions.RequestException as exc:
        raise ValueError('Upstox network error: ' + str(exc)) from exc
    if not response.ok:
        raise ValueError(f'Upstox HTTP {response.status_code} on {path}: {response.text[:800]}')
    try:
        obj = response.json()
    except ValueError as exc:
        raise ValueError(f'Upstox returned non-JSON data on {path}: {response.text[:300]}') from exc
    if obj.get('status') != 'success':
        raise ValueError('Upstox error: ' + str(obj.get('errors', obj)))
    return obj.get('data', {})

def dtparse(s): return datetime.fromisoformat(s.replace('Z','+00:00')).astimezone(IST)
def parse_rows(raw, tf, now):
    rows={}; delta=timedelta(days=1) if tf=='day' else timedelta(minutes=int(tf))
    for x in raw:
        if len(x)<6: continue
        dt=dtparse(x[0]); end=dt+delta
        if tf=='day': complete=dt.date()<now.date() or (dt.date()==now.date() and now.time()>=time(15,30))
        else: complete=end<=now
        rows[x[0]]={'timestamp':dt.strftime('%Y-%m-%d %H:%M:%S %Z'),'open':x[1],'high':x[2],'low':x[3],'close':x[4],'volume':x[5],'oi':x[6] if len(x)>6 else '', 'status':'Completed' if complete else 'Forming','_dt':dt}
    return sorted(rows.values(),key=lambda a:a['_dt'],reverse=True)

def collect(req):
    token=str(req.get('token','')).strip(); symbol=str(req.get('symbol','')).strip()[:50]; tf=req.get('tf'); days=int(req.get('days',7))
    if not token or not symbol or tf not in ('15','30','day') or not 1<=days<=30: raise ValueError('Invalid request fields')
    found=api('/v2/instruments/search',token,{'query':symbol,'exchanges':'NSE','segments':'EQ','records':30})
    if isinstance(found,dict): found=found.get('instruments',found.get('results',[]))
    if not isinstance(found,list): raise ValueError('Unexpected Upstox instrument-search response')
    matches=[x for x in found if x.get('segment')=='NSE_EQ' and x.get('instrument_key')]
    if not matches: raise ValueError('No NSE equity matched. Try the exact NSE trading symbol.')
    matches.sort(key=lambda x:(str(x.get('trading_symbol','')).upper()!=symbol.upper(),x.get('instrument_type')!='EQ'))
    stock=matches[0]; key=quote(stock['instrument_key'],safe=''); now=datetime.now(IST); today=now.date(); since=today-timedelta(days=days)
    unit,interval=('days','1') if tf=='day' else ('minutes',tf)
    hist=api(f'/v3/historical-candle/{key}/{unit}/{interval}/{today}/{since}',token)
    raw=hist.get('candles',[]) if isinstance(hist,dict) else []
    if tf!='day':
        intr=api(f'/v3/historical-candle/intraday/{key}/{unit}/{interval}',token)
        raw+=intr.get('candles',[]) if isinstance(intr,dict) else []
    rows=parse_rows(raw,tf,now)
    daily=api(f'/v3/historical-candle/{key}/days/1/{today}/{today-timedelta(days=20)}',token)
    drows=parse_rows(daily.get('candles',[]), 'day',now)
    prev=next((r for r in drows if r['_dt'].date()<today and r['status']=='Completed'),None)
    done=next((r for r in rows if r['status']=='Completed'),None)
    forming=next((r for r in rows if r['status']=='Forming'),None)
    def public(r): return {k:v for k,v in r.items() if k!='_dt'} if r else None
    return {'symbol':stock.get('trading_symbol'),'instrument_key':stock['instrument_key'],'fetched':now.strftime('%Y-%m-%d %H:%M:%S IST'),'latest':public(done),'forming':public(forming),'previous':{'date':prev['_dt'].date().isoformat(),'high':prev['high'],'low':prev['low']} if prev else None,'rows':[public(r) for r in rows]}

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if urlsplit(self.path).path!='/': self.send_error(404);return
        b=PAGE.encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
    def do_POST(self):
        if self.path!='/api/ohlc':self.send_error(404);return
        try:
            n=int(self.headers.get('Content-Length','0'))
            if n<1 or n>20000: raise ValueError('Invalid request size')
            obj=collect(json.loads(self.rfile.read(n)))
            status=200
        except Exception as e: obj={'error':str(e)};status=400
        b=json.dumps(obj).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
    def log_message(self,format,*args): pass

if __name__=='__main__':
    server=ThreadingHTTPServer(('127.0.0.1',8765),Handler)
    print('Scanner 3 OHLC Collector: http://127.0.0.1:8765',flush=True)
    print('Windows truststore enabled:', TRUSTSTORE_ENABLED, flush=True)
    threading.Timer(1,lambda:webbrowser.open('http://127.0.0.1:8765')).start()
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
