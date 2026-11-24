# Builds the MDYS Kalamela Centre entry form (Excel). Edit IND_EVENTS / TEAM_EVENTS below to match the Rules screen,
# then run:  pip install openpyxl  &&  python build_centre_form.py
from openpyxl import Workbook
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, Protection
from openpyxl.utils import get_column_letter as L

MAROON, YELLOW, TEAL = "A30D35", "FDBE00", "078781"
thin = Side(style="thin", color="BFBFBF"); BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
INPUT = PatternFill("solid", fgColor="FFF6D5"); CALC = PatternFill("solid", fgColor="F2F2F2")
HDR = PatternFill("solid", fgColor=MAROON); SUB = PatternFill("solid", fgColor=TEAL)
EVA = PatternFill("solid", fgColor="FBE9EC"); EVB = PatternFill("solid", fgColor="E6F3F2")
OKF = PatternFill("solid", fgColor="D9F2E3"); BADF = PatternFill("solid", fgColor="FBD5D5")
def font(**k): k.setdefault("name", "Arial"); k.setdefault("size", 10); return Font(**k)
CEN = Alignment(horizontal="center", vertical="center", wrap_text=True); WR = Alignment(vertical="center", wrap_text=True)

IND_EVENTS = [("Solo Malayalam (Male)","Male"),("Solo Malayalam (Female)","Female"),("Solo English (Male)","Male"),("Solo English (Female)","Female"),
 ("Instrumental – Wind","Any"),("Instrumental – String","Any"),("Instrumental – Keyboard","Any"),("Instrumental – Percussion","Any"),
 ("Elocution Malayalam","Any"),("Elocution English","Any"),("Bible Reading Malayalam","Any"),("Bible Reading English","Any"),
 ("Essay Writing Malayalam","Any"),("Essay Writing English","Any"),("Story Writing Malayalam","Any"),("Story Writing English","Any"),
 ("Poem Writing Malayalam","Any"),("Poem Writing English","Any"),("Poetry Recitation Malayalam","Any"),("Poetry Recitation English","Any"),
 ("Clay Modelling","Any"),("Quiz","Any"),("Pencil Drawing","Any"),("Painting","Any"),("Cartoon (Pencil)","Any")]
TEAM_EVENTS = [("Group Song",7,14,"Any"),("Margamkali (Female)",6,12,"Female"),("Choreography",5,14,"Any"),("Tableau",1,10,"Any"),("Mime",6,10,"Any")]
PHOTO_H = 46   # row height (pt) for rows with a photo

wb = Workbook()
def title(ws, text, sub, ncols):
    ws["A1"] = "MAR THOMA YUVAJANA SAKHYAM – MUMBAI DIOCESE  ·  KALAMELA 2026–27"
    ws["A1"].font = font(bold=True, size=13, color="FFFFFF")
    for c in range(1, ncols + 1): ws.cell(1, c).fill = HDR
    ws.row_dimensions[1].height = 24
    ws["A2"] = text; ws["A2"].font = font(bold=True, size=12, color=MAROON)
    ws["A3"] = sub; ws["A3"].font = font(italic=True, size=9, color="595959")
def inp(c): c.fill = INPUT; c.protection = Protection(locked=False); c.border = BORDER; c.font = font(); c.alignment = WR
def calc(c, fill=CALC): c.fill = fill; c.border = BORDER; c.font = font(); c.alignment = WR
def dv(ws, f1, rng, prompt=None, kind="list", **kw):
    d = DataValidation(type=kind, formula1=f1, allow_blank=True, showErrorMessage=True, **kw)
    if prompt: d.promptTitle, d.prompt, d.showInputMessage = "Tip", prompt, True
    ws.add_data_validation(d); d.add(rng)
def status_cf(ws, rng, first):
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'{first}="OK"'], fill=OKF))
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'AND({first}<>"",{first}<>"OK")'], fill=BADF, font=font(bold=True, color="9C0006")))
def protect(ws):
    p = ws.protection; p.sheet = True; p.formatColumns = p.formatRows = p.formatCells = False
    p.insertRows = True
def hdr_row(ws, r, heads, widths, inputs):
    for i, (h, w) in enumerate(zip(heads, widths), 1):
        c = ws.cell(r, i, h); c.font = font(bold=True, color="FFFFFF"); c.alignment = CEN; c.border = BORDER
        c.fill = HDR if i in inputs else SUB
        if w: ws.column_dimensions[L(i)].width = w
    ws.row_dimensions[r].height = 30
AGE = lambda d, r: (f'IF(NOT(ISNUMBER({d}{r})),"",IF({d}{r}>=DATE(2009,1,1),"Group I",'
                    f'IF({d}{r}>=DATE(1992,1,1),"Group II","Not eligible")))')

# ---------- Lists (hidden) ----------
ls = wb.active; ls.title = "Lists"
ls["A1"], ls["B1"] = "Gender", "Info for the compiler – do not edit"
ls["A2"], ls["A3"] = "Male", "Female"
ls["D1"], ls["E1"], ls["F1"], ls["G1"], ls["H1"], ls["I1"] = "Team event", "Place", "Header row", "First row", "Last row", "Max members"

# ---------- Start Here ----------
st = wb.create_sheet("Start Here")
title(st, "CENTRE ENTRY FORM – how to fill", "Fill the yellow cells only. Grey cells fill themselves. Red Status cells tell you exactly what to fix.", 2)
st.column_dimensions["A"].width = 12; st.column_dimensions["B"].width = 112
lines = [
 ("STEP 1", "Centre Details – Centre name, office-bearers, and the Sakhas taking part (this list feeds the Sakha dropdowns)."),
 ("STEP 2", "Group I (born on/after 01-01-2009) and Group II (born 01-01-1992 to 31-12-2008) – every event is already listed with a 1st and 2nd place row. Type the winner's details on that row and put their photo in the Photo cell. Leave the row empty if there is no entry."),
 ("STEP 3", "Team Events – each team event has a box for the 1st place team and the 2nd place team. Pick the Sakha, then type the members and their photos. Margamkali singers are entered as members. The last 2 rows of each box are for substitutes."),
 ("STEP 4", "Summary & Declaration – check it says READY TO SUBMIT, enter the total food headcount, then print, sign and seal."),
 ("SEND", "Email this Excel file AND the signed, sealed PDF of the declaration to mdys.kalamela@gmail.com by 30 November 2026, 5:00 PM."),
 ("", ""),
 ("PHOTOS", "Click the Photo cell → Insert → Pictures → Place in Cell (Excel 365), or paste the photo onto the Photo cell. Use a clear passport-size face photo. For someone in several events, one photo on any of their rows is enough."),
 ("SAME PERSON", "If someone is in more than one event, type their name and date of birth exactly the same way each time – the form uses these to count their events."),
 ("", ""),
 ("RULES", "Only the 1st and 2nd place winners from the Centre Kalamela.  Maximum 4 individual events per person (team events are not counted)."),
 ("", "Born before 01-01-1992: not eligible.  Solo Male/Female and Margamkali (girls only) gender rules apply."),
 ("", "Team sizes (+ up to 2 substitutes): Group Song 7–14 · Margamkali 6–12 incl. singers · Choreography 5–14 · Tableau up to 10 · Mime 6–10.  The 1st and 2nd place teams must be from different Sakhas."),
 ("", "Choreography teams must give their song(s) for vetting."),
]
for r, (a, b) in enumerate(lines, 5):
    st.cell(r, 1, a).font = font(bold=True, color=MAROON); st.cell(r, 2, b).font = font(); st.cell(r, 2).alignment = WR
    st.row_dimensions[r].height = 30 if len(b) > 115 else 16
st.sheet_view.showGridLines = False
for w in (st,):
    w.page_setup.fitToWidth = 1; w.page_setup.fitToHeight = 1; w.sheet_properties.pageSetUpPr.fitToPage = True

# ---------- Centre Details ----------
cs = wb.create_sheet("Centre Details")
title(cs, "STEP 1 – CENTRE DETAILS", "", 2)
cs.column_dimensions["A"].width = 32; cs.column_dimensions["B"].width = 44
for i, lab in enumerate(["Centre name","Centre President","Centre Secretary","Secretary WhatsApp","Centre email"], 5):
    cs.cell(i, 1, lab).font = font(bold=True); inp(cs.cell(i, 2))
cs["A12"] = "Sakhas taking part (one per row)"; cs["A12"].font = font(bold=True, color="FFFFFF"); cs["A12"].fill = HDR
for r in range(13, 43): inp(cs.cell(r, 1))
SAKHA = "'Centre Details'!$A$13:$A$42"
cs.page_setup.fitToWidth = 1; cs.page_setup.fitToHeight = 1; cs.sheet_properties.pageSetUpPr.fitToPage = True
protect(cs)

# ---------- Group I / Group II ----------
G_ROW0 = 6
GROUPS = [("Group I", "born on or after 01-01-2009", "DATE(2009,1,1)", "DATE(2026,12,31)"),
          ("Group II", "born 01-01-1992 to 31-12-2008", "DATE(1992,1,1)", "DATE(2008,12,31)")]
heads = ["Event","Place","Full name","Gender","Date of birth\nDD-MM-YYYY","Sakha","Membership\nSl. No.","WhatsApp no.","Photo","Age group","Status"]
widths = [27,7,26,9,13,17,11,13,14,10,40]
for g, rule, lo, hi in GROUPS:
    ws = wb.create_sheet(g); ws.sheet_properties.tabColor = MAROON if g == "Group I" else TEAL
    title(ws, f"STEP 2 – {g.upper()} INDIVIDUAL EVENTS ({rule})",
          "Type each winner on their event's 1st / 2nd row and add a photo. Leave a row empty if there is no entry. Max 4 individual events per person.", 11)
    hdr_row(ws, 5, heads, widths, {3,4,5,6,7,8,9})
    r = G_ROW0; R0 = r; R1 = R0 + 2 * len(IND_EVENTS) - 1
    for k, (ev, gen) in enumerate(IND_EVENTS):
        band = EVA if k % 2 == 0 else EVB
        for pos in ("1st", "2nd"):
            ws[f"A{r}"], ws[f"B{r}"] = ev, pos
            calc(ws[f"A{r}"], band); calc(ws[f"B{r}"], band); ws[f"A{r}"].font = font(bold=True); ws[f"B{r}"].alignment = CEN
            for c in "CEFGHI": inp(ws[f"{c}{r}"])
            if gen == "Any": inp(ws[f"D{r}"])
            else: ws[f"D{r}"] = gen; calc(ws[f"D{r}"])
            calc(ws[f"J{r}"]); calc(ws[f"K{r}"])
            ws[f"E{r}"].number_format = "DD-MM-YYYY"; ws[f"G{r}"].number_format = "@"; ws[f"H{r}"].number_format = "@"
            ws[f"J{r}"] = f'=IF(C{r}="","",{AGE("E", r)})'
            ws[f"L{r}"] = f'=IF(C{r}="",0,IF(COUNTIFS(C${R0}:C{r},C{r},E${R0}:E{r},E{r})=1,1,0))'   # first row of a person
            chk = (f'IF(OR(D{r}="",E{r}="",F{r}="",G{r}="",H{r}=""),"Fill all details; ","")'
                   f'&IF(AND(E{r}<>"",NOT(ISNUMBER(E{r}))),"Date of birth is not a valid date; ","")'
                   f'&IF(J{r}="Not eligible","Born before 01-01-1992 – not eligible; ",IF(AND(J{r}<>"",J{r}<>"{g}"),"Belongs in "&J{r}&" – move to that sheet; ",""))'
                   f'&IF(AND(H{r}<>"",LEN(H{r})<>10),"WhatsApp no. must be 10 digits; ","")'
                   f'&IF(COUNTIFS($C${R0}:$C${R1},C{r},$E${R0}:$E${R1},E{r})>4,"In more than 4 individual events; ","")'
                   f'&IF(AND(C{r}<>"",B{r}="2nd",C{r}=C{r-1},E{r}=E{r-1}),"Same person in 1st and 2nd place; ","")')
            ws[f"M{r}"] = f'=IF(C{r}="","",{chk})'
            ws[f"K{r}"] = f'=IF(C{r}="","",IF(M{r}="","OK",M{r}))'
            ws.row_dimensions[r].height = PHOTO_H
            r += 1
        for c in "ABCDEFGHIJK": ws[f"{c}{r-1}"].border = Border(left=thin, right=thin, top=thin, bottom=Side(style="medium", color="7F7F7F"))
    for c in "LM": ws.column_dimensions[c].hidden = True
    dv(ws, "Lists!$A$2:$A$3", f"D{R0}:D{R1}")
    dv(ws, lo, f"E{R0}:E{R1}", f"{g}: {rule}. Type as DD-MM-YYYY", kind="date", operator="between", formula2=hi,
       error=f"{g} is for members {rule}. Enter this person on the other group's sheet.")
    dv(ws, SAKHA, f"F{R0}:F{R1}", "Add Sakhas on the Centre Details sheet first")
    dv(ws, "10", f"H{R0}:H{R1}", "10-digit mobile number", kind="textLength", operator="equal", error="Enter a 10-digit number")
    status_cf(ws, f"K{R0}:K{R1}", f"$K{R0}")
    ws.freeze_panes = "C6"; protect(ws)
    ws.page_setup.orientation = "landscape"; ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True; ws.print_title_rows = "5:5"
GR0, GR1 = G_ROW0, G_ROW0 + 2 * len(IND_EVENTS) - 1

# ---------- Team Events ----------
te = wb.create_sheet("Team Events"); te.sheet_properties.tabColor = YELLOW
title(te, "STEP 3 – TEAM EVENTS (one box per team – leave a box empty if there is no team)",
      "Pick the Sakha, then type the members with their photos. Margamkali singers are members. The last 2 rows are for substitutes.", 9)
heads = ["No.","Full name","Gender","Date of birth\nDD-MM-YYYY","Membership\nSl. No.","Role","Photo","Age group","Status"]
for c, w in zip("ABCDEFGHI", [11,28,9,13,12,11,14,10,42]): te.column_dimensions[c].width = w
te["A5"] = "Go to:"; te["A5"].font = font(bold=True)
r = 7; blocks = []; lrow = 2; jc = 2
for ev, mn, mx, gen in TEAM_EVENTS:
    for pos in ("1st", "2nd"):
        h = r
        te.merge_cells(f"A{h}:I{h}"); te[f"A{h}"] = f"{ev.upper()}  –  {pos.upper()} PLACE TEAM AT CENTRE"
        te[f"A{h}"].font = font(bold=True, size=11, color="FFFFFF"); te[f"A{h}"].fill = HDR; te.row_dimensions[h].height = 20
        if pos == "1st":
            c = te.cell(5, jc, ev); c.hyperlink = f"#'Team Events'!A{h}"; c.font = font(color="0563C1", underline="single"); jc += 1
        d = h + 1
        te[f"A{d}"] = "Sakha"; te[f"A{d}"].font = font(bold=True)
        te.merge_cells(f"B{d}:C{d}"); inp(te[f"B{d}"]); inp(te[f"C{d}"]); dv(te, SAKHA, f"B{d}")
        if ev == "Choreography":
            te[f"D{d}"] = "Song(s) for vetting"; te[f"D{d}"].font = font(bold=True); te[f"D{d}"].alignment = WR
            te.merge_cells(f"E{d}:I{d}"); inp(te[f"E{d}"])
            te.row_dimensions[d].height = 28
        te[f"A{d+1}"] = f"Allowed: {mn}–{mx} members" + (" (incl. singers), girls only" if gen == "Female" else "") + " + up to 2 substitutes"
        te[f"A{d+1}"].font = font(italic=True, size=9, color="595959")
        hr = d + 2; hdr_row(te, hr, heads, [None]*9, {2,3,4,5,7})
        f0 = hr + 1; f1 = f0 + mx + 1
        for k, rr in enumerate(range(f0, f1 + 1)):
            sub = k >= mx
            te[f"A{rr}"] = f"Sub {k-mx+1}" if sub else k + 1; calc(te[f"A{rr}"]); te[f"A{rr}"].alignment = CEN
            for c in "BDEG": inp(te[f"{c}{rr}"])
            if gen == "Any": inp(te[f"C{rr}"])
            else: te[f"C{rr}"] = gen; calc(te[f"C{rr}"])
            te[f"F{rr}"] = "Substitute" if sub else "Member"; calc(te[f"F{rr}"])
            calc(te[f"H{rr}"]); calc(te[f"I{rr}"])
            te[f"D{rr}"].number_format = "DD-MM-YYYY"; te[f"E{rr}"].number_format = "@"
            te[f"H{rr}"] = f'=IF(B{rr}="","",{AGE("D", rr)})'
            te[f"J{rr}"] = (f'=IF(B{rr}="","",IF(OR(C{rr}="",D{rr}="",E{rr}=""),"Fill all details; ","")'
                            f'&IF(AND(D{rr}<>"",NOT(ISNUMBER(D{rr}))),"Date of birth is not a valid date; ","")'
                            f'&IF(H{rr}="Not eligible","Born before 01-01-1992 – not eligible; ","")'
                            f'&IF(COUNTIFS($B${f0}:$B${f1},B{rr},$D${f0}:$D${f1},D{rr})>1,"Listed twice in this team; ",""))')
            te[f"I{rr}"] = f'=IF(B{rr}="","",IF(J{rr}="","OK",J{rr}))'
            te.row_dimensions[rr].height = PHOTO_H
        dv(te, "Lists!$A$2:$A$3", f"C{f0}:C{f1}")
        dv(te, "DATE(1992,1,1)", f"D{f0}:D{f1}", "Type as DD-MM-YYYY", kind="date", operator="between", formula2="DATE(2026,12,31)",
           error="Enter a valid date. Members born before 01-01-1992 are not eligible.")
        status_cf(te, f"I{f0}:I{f1}", f"$I{f0}")
        sr = f1 + 1
        te[f"K{h}"] = f'=COUNTIF(B{f0}:B{f0+mx-1},"?*")'
        te[f"L{h}"] = f'=COUNTIF(B{f1-1}:B{f1},"?*")'
        te[f"M{h}"] = f'=IF(OR(K{h}+L{h}>0,B{d}<>""),1,0)'
        chk = (f'IF(B{d}="","Pick the Sakha; ","")&IF(K{h}<{mn},"Only "&K{h}&" members (min {mn}); ","")'
               f'&IF(COUNTIF(I{f0}:I{f1},"OK")<K{h}+L{h},"Fix the red member rows; ","")')
        if ev == "Choreography": chk += f'&IF(E{d}="","Song(s) needed for vetting; ","")'
        if pos == "2nd": chk += f'&IF(AND(B{d}<>"",B{d}=B{blocks[-1]["d"]}),"Same Sakha as the 1st place team; ","")'
        te[f"N{h}"] = f'=IF(M{h}=0,"",{chk})'
        te[f"A{sr}"] = "Team status:"; te[f"A{sr}"].font = font(bold=True)
        te.merge_cells(f"B{sr}:I{sr}")
        te[f"B{sr}"] = f'=IF(M{h}=0,"(no team entered)",IF(N{h}="","OK – "&K{h}&" members"&IF(L{h}>0," + "&L{h}&" substitute(s)",""),N{h}))'
        te[f"B{sr}"].font = font(bold=True)
        te.conditional_formatting.add(f"B{sr}", FormulaRule(formula=[f'AND($M${h}=1,$N${h}="")'], fill=OKF))
        te.conditional_formatting.add(f"B{sr}", FormulaRule(formula=[f'AND($M${h}=1,$N${h}<>"")'], fill=BADF, font=font(bold=True, color="9C0006")))
        blocks.append(dict(ev=ev, pos=pos, h=h, d=d, f0=f0, f1=f1))
        for c, v in zip("DEFGHI", [ev, pos, h, f0, f1, mx]): ls[f"{c}{lrow}"] = v
        lrow += 1
        r = sr + 3
for c in "JKLMN": te.column_dimensions[c].hidden = True
te.freeze_panes = "A7"; protect(te)
te.page_setup.fitToWidth = 1; te.page_setup.fitToHeight = 0; te.sheet_properties.pageSetUpPr.fitToPage = True

# ---------- Summary & Declaration ----------
s = wb.create_sheet("Summary & Declaration")
title(s, "SUMMARY & DECLARATION", "Print this sheet, sign, seal and email the PDF together with this Excel file.", 6)
for c, w in zip("ABCDEF", [48,14,14,14,4,22]): s.column_dimensions[c].width = w
def band(r, text, heads=()):
    s.cell(r, 1, text).font = font(bold=True, color="FFFFFF")
    for c in range(1, 5): s.cell(r, c).fill = SUB
    for i, hd in enumerate(heads, 2): s.cell(r, i, hd).font = font(bold=True, color="FFFFFF"); s.cell(r, i).alignment = CEN
def lab(r, text, val=None, bold=False, fmt=None, input_=False):
    s.cell(r, 1, text).font = font(bold=bold); c = s.cell(r, 2, val)
    (inp if input_ else calc)(c); c.alignment = CEN; c.font = font(bold=bold)
    if fmt: c.number_format = fmt
G1, G2, TE = "'Group I'!", "'Group II'!", "'Team Events'!"
band(5, "CENTRE")
lab(6, "Centre", "=IF('Centre Details'!B5=\"\",\"(enter on Centre Details)\",'Centre Details'!B5)", bold=True)
lab(7, "Sakhas taking part", "=COUNTIF('Centre Details'!A13:A42,\"?*\")")
lab(8, "Group I participants (individual events)", f"=SUM({G1}L{GR0}:L{GR1})")
lab(9, "Group II participants (individual events)", f"=SUM({G2}L{GR0}:L{GR1})")
lab(10, "Individual entries", f"=COUNTIF({G1}C{GR0}:C{GR1},\"?*\")+COUNTIF({G2}C{GR0}:C{GR1},\"?*\")")
lab(11, "Teams", "=" + "+".join(f"{TE}M{b['h']}" for b in blocks))
lab(12, "Team members (incl. substitutes)", "=" + "+".join(f"{TE}K{b['h']}+{TE}L{b['h']}" for b in blocks))
band(14, "CHECKS")
issues = (f"=COUNTIFS({G1}K{GR0}:K{GR1},\"<>OK\",{G1}C{GR0}:C{GR1},\"?*\")+COUNTIFS({G2}K{GR0}:K{GR1},\"<>OK\",{G2}C{GR0}:C{GR1},\"?*\")+"
          + "+".join(f"IF(AND({TE}M{b['h']}=1,{TE}N{b['h']}<>\"\"),1,0)" for b in blocks)
          + "+IF('Centre Details'!B5=\"\",1,0)")
lab(15, "Rows needing attention", issues, bold=True)
s["A16"] = '=IF(B15=0,"✔  READY TO SUBMIT","✖  FIX "&B15&" ITEM(S) – see the red Status cells")'
s["A16"].font = font(bold=True, size=12); s.merge_cells("A16:D16")
s.conditional_formatting.add("A16", FormulaRule(formula=["$B$15=0"], fill=OKF))
s.conditional_formatting.add("A16", FormulaRule(formula=["$B$15>0"], fill=BADF))
s["A17"] = "Photos are not checked here – make sure every participant has one."; s["A17"].font = font(italic=True, size=9, color="595959")
band(19, "FEES (pay by 2 Dec 2026 to the MDYS account)", ["Rate (Rs.)","Count","Amount (Rs.)"])
for r, (n, rate, cnt) in enumerate([("Individual entries",100,"=B10"),("Teams",200,"=B11"),("Shakha Vihitham (per Sakha)",750,"=B7")], 20):
    s[f"A{r}"] = n; s[f"A{r}"].font = font(); s[f"B{r}"] = rate; s[f"C{r}"] = cnt; s[f"D{r}"] = f"=B{r}*C{r}"
    for c in "BCD": calc(s[f"{c}{r}"]); s[f"{c}{r}"].alignment = CEN; s[f"{c}{r}"].number_format = "#,##0"
s["A23"] = "TOTAL PAYABLE"; s["A23"].font = font(bold=True); s["D23"] = "=SUM(D20:D22)"
s["D23"].font = font(bold=True); s["D23"].number_format = "#,##0"; s["D23"].border = BORDER; s["D23"].alignment = CEN
band(25, "FOOD HEADCOUNT (by 30 Nov 2026 – no spot headcount)")
lab(26, "Total food headcount (breakfast, lunch & snacks)", input_=True)
lab(27, "Food amount @ Rs. 260 per person", "=N(B26)*260", fmt="#,##0")
lab(28, "Dinner headcount – Pune, Gujarat & Goa Centres only", input_=True)
band(30, "DECLARATION")
s["A31"] = ("We certify that the participants listed in this form are members of the Mar Thoma Yuvajana Sakhyam for 2026–27, "
            "won 1st or 2nd place at our Centre Kalamela, and that the details given are correct.")
s["A31"].alignment = WR; s["A31"].font = font(); s.merge_cells("A31:F31"); s.row_dimensions[31].height = 42
s["A35"] = "______________________________"; s["C35"] = "______________________________"; s["F35"] = "Seal"
s["A36"] = "=\"Centre President: \"&'Centre Details'!B6"; s["C36"] = "=\"Centre Secretary: \"&'Centre Details'!B7"; s["A37"] = "Date:"
for rr in (35, 36, 37):
    for c in "ACF": s[f"{c}{rr}"].font = font(bold=True)
s.print_area = "A1:F37"; s.page_setup.fitToWidth = 1; s.page_setup.fitToHeight = 1; s.sheet_properties.pageSetUpPr.fitToPage = True
s.sheet_view.showGridLines = False; protect(s)
ls["K1"], ls["K2"], ls["L2"], ls["K3"], ls["L3"] = "Summary cells", "food_total", "B26", "dinner", "B28"

wb._sheets = [wb[n] for n in ["Start Here","Centre Details","Group I","Group II","Team Events","Summary & Declaration","Lists"]]
ls.sheet_state = "hidden"; protect(ls); wb.active = 0
wb.save("MDYS_Kalamela_Centre_Entry_Form.xlsx"); print("saved", [(b["ev"], b["pos"], b["h"], b["f0"], b["f1"]) for b in blocks])
