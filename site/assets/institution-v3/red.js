'use strict';

(() => {
  const counts = new Intl.NumberFormat('zh-HK', {maximumFractionDigits: 2});
  const format = value => Number.isFinite(value) ? counts.format(value) : '—';
  let activeChart = null;

  function options(name, label, pairs, value) {
    return '<select name="'+name+'" aria-label="'+label+'">'+pairs.map(([key, text]) =>
      '<option value="'+esc(key)+'"'+(key===value?' selected':'')+'>'+esc(text)+'</option>'
    ).join('')+'</select>';
  }
  function weeks() {
    return (redSnapshot?.weeks || []).filter(w => w && w.end && Array.isArray(w.notes))
      .slice().sort((a,b) => b.end.localeCompare(a.end));
  }
  function selectedWeek(all) {
    return params.has('week')?all.find(w => w.end === params.get('week')):all[0];
  }
  function grain() {
    return params.get('grain') === 'weekly' ? 'weekly' : 'daily';
  }
  function redControls(section) {
    if (!redSnapshot) return '';
    if (section === 'index') {
      return '<label class="filter-field">指标粒度'+options('grain','搜索指数粒度',[['daily','日度原值'],['weekly','周平均（周六至周五）']],grain())+'</label>' +
        '<label class="filter-field">品牌'+select('brand','全部品牌', redSnapshot.search_index?.brands || [])+'</label>';
    }
    const all = weeks(), week = selectedWeek(all);
    if (!all.length) return '';
    const records = all.flatMap(w => w.notes);
    const values = key => [...new Set(records.map(n => n[key]).filter(Boolean))].sort((a,b) => a.localeCompare(b,'zh-Hans'));
    const requested=params.get('week')||all[0].end;
    const choices=all.map(w=>[w.end,dayShift(w.end,-6)+' 至 '+w.end]);
    if(!week)choices.unshift([requested,'所选周没有监控原件']);
    if(section==='week')return '<label class="archive-date">日历选周<input type="date" data-note-calendar value="'+esc(params.get('noteDay')||requested)+'"></label>'+options('week','周报期',choices,requested);
    return select('noteBank','全部监测机构',values('bank')) + select('theme','全部业务主题',values('theme')) +
      options('issue','投诉与问题反馈筛选',[['','全部问题状态'],['yes','投诉与问题反馈'],['unclear','问题待核实'],['no','未见具体问题'],['unreviewed','历史未复核']],params.get('issue')||'')+
      options('sort','笔记排序',[['engage','互动最多'],['comments','评论最多'],['likes','点赞最多']],noteOrder()) +
      '<input type="search" name="q" aria-label="搜索笔记标题" placeholder="搜索笔记标题" value="'+esc(params.get('q')||'')+'">';
  }
  function sentimentFilter() {
    const current=params.get('noteSent') || '';
    return '<div class="note-sentiments" role="group" aria-label="按笔记评价筛选">'+
      ['',...feedback].map(value=>'<button type="button" data-note-sent="'+value+'" aria-pressed="'+(value===current)+'">'+
        (value?'<i aria-hidden="true" class="feedback-'+feedback.indexOf(value)+'"></i>':'')+
        (value||'全部评价')+'</button>').join('')+'</div>';
  }
  function noteOrder() {
    const key = params.get('sort');
    return key==='likes' || key==='comments' ? key : 'engage';
  }
  function pagination(count,section) {
    return count > rowLimit(section) ? '<button type="button" class="more" data-red-more="'+section+'">查看更多</button>' : '';
  }
  function rowLimit(section) {
    return Math.max(15,Number(params.get(section+'Rows'))||15);
  }
  function indexView() {
    const index = redSnapshot.search_index;
    const rows = index?.[grain()] || {};
    const range=dateSelection('indexDate'), weekly=grain()==='weekly';
    const dates = Object.keys(rows).filter(d=>dateMatch(interval(d,weekly),range)).sort();
    const allBrands = index?.brands || [];
    const brand = params.get('brand');
    const brands = allBrands.includes(brand) ? [brand] : allBrands;
    if (!dates.length || !brands.length) {
      $('count').textContent = '';
      return empty('所选日期暂无已归档的搜索指数。');
    }
    
    activeChart = {
      dates,
      series: brands.map(label => ({label, values:dates.map(d => Number.isFinite(rows[d][label]) ? rows[d][label] : null)})),
      unit:'指数', grain:weekly?'weekly':'daily',customRange:range.some(Boolean)
    };
    const headers = brands.map(b => '<th scope="col">'+esc(b)+'</th>').join('');
    const details=pagedTable('indexPage','小红书搜索指数明细',dates.slice().reverse(),'<th scope="col">'+(weekly?'周截至':'日期')+'</th>'+headers,brands.length+1,
      selected=>periodRows(selected,d=>brands.map(b=>'<td>'+format(rows[d][b])+'</td>').join(''),d=>weekly?dayShift(d,-6)+' 至 '+d:reportingWeekLabel(d)));
    return '<p class="red-source">小红书搜索指数 · '+esc(dates[0])+' 至 '+esc(dates.at(-1))+
      (weekly?' · 每周六至周五取平均':' · 日度原值')+'</p>'+
      '<div id="red-index-chart">'+window.marketTrendHTML(activeChart)+'</div>'+(weekly?weeklyComparison(rows,dates.at(-1),brands):'')+
      details;
  }
  function canonicalNoteId(note) {
    const id = String(note.id || '');
    // Build external links from platform IDs. The original export also contains session parameters.
    if (/^[0-9a-f]{24}$/i.test(id)) return id.toLowerCase();
    const match = /^https:\/\/www\.xiaohongshu\.com\/explore\/([0-9a-f]{24})(?:[/?#]|$)/i.exec(note.url || '');
    return match ? match[1].toLowerCase() : '';
  }
  function notesView() {
    const week = selectedWeek(weeks());
    if (!week) {
      $('count').textContent='';
      return empty('这一周没有找到笔记监控原件。可以从周报期列表选择已归档的一周。');
    }
    const bank = params.get('noteBank'), theme = params.get('theme'), sentiment=params.get('noteSent'), order = noteOrder();
    const query = (params.get('q') || '').trim().toLocaleLowerCase();
    const posts = new Map();
    // Themes and mentions belong to each monitored record. Filter before grouping across institutions.
    for (const note of week.notes) {
      if ((bank && note.bank!==bank) || (theme && note.theme!==theme)) continue;
      if (sentiment && note.sentiment!==sentiment) continue;
      if (params.get('issue') && issueState(note)!==params.get('issue')) continue;
      if (query && !String(note.title || '').toLocaleLowerCase().includes(query)) continue;
      const id = canonicalNoteId(note);
      if (!id) continue;
      let post = posts.get(id);
      if (!post) {
        post={id, sample:note, banks:new Map(), themes:new Set(),issues:new Map()};
        posts.set(id,post);
      }
      if (note.bank) post.banks.set(note.bank,note.sentiment);
      if (note.theme) post.themes.add(note.theme);
      post.issues.set(note.bank,{state:issueState(note),summary:note.issue?.summary||'',type:note.issue?.type||''});
      // Display one observation for all three engagement metrics, with no summing across banks.
      if ((note[order] ?? -1) > (post.sample[order] ?? -1)) post.sample=note;
    }
    const sorted = [...posts.values()].sort((a,b) =>
      (b.sample[order] ?? -1)-(a.sample[order] ?? -1) || (b.sample.engage ?? -1)-(a.sample.engage ?? -1) ||
      a.id.localeCompare(b.id)
    );
    
    if (!sorted.length) return empty('本期没有匹配这些条件的笔记。');
    const cards = sorted.slice(0,rowLimit('notes')).map(({id,sample,banks,themes,issues}) => {
      const labels = [...themes].map(t => '<span class="tag">'+esc(t)+'</span>').join('');
      const institutions = [...banks].map(([bank,rating])=>'<span>'+esc(bank)+
        (feedback.includes(rating)?' <small class="note-rating feedback-'+feedback.indexOf(rating)+'">'+esc(rating)+'</small>':'')+'</span>').join('');
      const issueText=[...issues].filter(([b,i])=>['yes','unclear'].includes(i.state)).map(([b,i])=>'<p class="issue-note"><span class="tag">'+(i.state==='yes'?'投诉与问题反馈':'问题待核实')+'</span> '+esc(b)+' · '+esc(i.type)+(i.summary?'：'+esc(i.summary):'：可读资料不足，暂不计入问题篇数。')+'</p>').join('');
      return '<article class="row red-note-row"><div class="red-note-banks">'+institutions+'</div>'+
        '<div>'+labels+'<h3>'+esc(sample.title)+'</h3>'+issueText+'<small>互动 '+format(sample.engage)+'　评论 '+format(sample.comments)+'　点赞 '+format(sample.likes)+'　收藏 '+format(sample.saves)+'</small>'+
        '<div class="note-original" data-original-note="'+esc(id)+'" data-original-bank="'+esc(sample.bank)+'"></div></div></article>';
    }).join('');
    return '<p class="red-source">小红书笔记 · 周报截至 '+esc(week.end)+' · '+sorted.length+' 篇原帖</p><div class="rows">'+cards+'</div>'+pagination(sorted.length,'notes');
  }
  function redView() {
    activeChart=null;
    if(xhsSection()==='notes'){
      const week=selectedWeek(weeks());
      return '<section class="red-section" id="red-notes"><div class="red-filters">'+redControls('week')+'</div>'+
        (week?weekBankSummary(week)+issueSummary(week)+'<h3 class="notes-list-title">笔记明细</h3>'+sentimentFilter()+'<div class="red-filters">'+redControls('notes')+'</div>':'')+notesView()+'</section>';
    }
    return '<section class="red-section"><div class="index-filter-bar">'+redControls('index')+periodDateForm('indexDate')+'</div>'+indexView()+'</section>';
  }
  function redMount() {
    if(xhsSection()==='notes')noteOriginalActions();
    document.querySelectorAll('[data-note-sent]').forEach(button=>button.onclick=()=>{
      if(button.getAttribute('aria-pressed')==='true')return;
      params.delete('notesRows');
      update('noteSent',button.dataset.noteSent);
      document.querySelector('[data-note-sent][aria-pressed="true"]')?.focus({preventScroll:true});
    });
    const calendar=document.querySelector('[data-note-calendar]');
    if(calendar)calendar.onchange=()=>{if(calendar.value){params.set('noteDay',calendar.value);update('week',weekFriday(calendar.value));}};
    const weekMenu=document.querySelector('select[name="week"]');
    if(weekMenu)weekMenu.onchange=()=>params.delete('noteDay');
    document.querySelectorAll('[data-red-more]').forEach(button=>button.onclick=()=>{
      const section=button.dataset.redMore;update(section+'Rows',String(rowLimit(section)+15));
    });
    const host=document.getElementById('red-index-chart');
    if (host && activeChart) window.mountMarketTrend(host,activeChart);
  }
  Object.assign(window,{redControls,redView,redMount});
})();
