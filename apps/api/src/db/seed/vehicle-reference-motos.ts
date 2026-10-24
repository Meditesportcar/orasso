// Compléments du référentiel (lot R3c) : motos et scooters. Format : voir `vehicle-catalog.ts` (« | moto » : type par
// défaut de la marque). Les marques qui font aussi des voitures (BMW, Honda, Suzuki…) gardent un seul nom de marque.
// Méthode et sources : docs/JOURNAL-DES-CHOIX.md, « Lot R3c ».

export const vehicleMotos = `
# --- Japon ------------------------------------------------------------------------------------------------------

@ Yamaha | JP | moto
R125 : 2008-
R3 : 2015-
R7 : OW02 1999-2000 ; Moderne 2021-
MT-03 : 2016-
MT-125 : 2014-
MT-10 : 2016-
Tracer 9 : Tracer 900 2015-2020 ; Tracer 9 2021-
Ténéré 700 : 2019-
XT 500 : 1976-1989
XT 600 : 1984-2003
XT 660 : XT 660 R 2004-2016 ; XT 660 Z Ténéré 2008-2016
Super Ténéré : XTZ 750 1989-1997 ; XT 1200 Z 2010-2021
TDM : 850 1991-2001 ; 900 2002-2011
Fazer : FZS 600 1998-2003 ; FZ6 2004-2010 ; FZS 1000 2001-2005 ; FZ1 2006-2015
FZR 1000 : 1987-1995
Thunderace : YZF 1000 R 1996-2003
XJR 1300 : 1999-2016
XJ 900 : 1983-1994
XSR 700 : 2016-
XSR 900 : 2016-
SR 500 : 1978-1999
RD 350 : LC 1980-1983 ; YPVS 1983-1995
DT 125 : 1974-2004
TZR 125 : 1987-1993
DT 50 : 1988-2003
XV 1900 : 2006-2016
Drag Star : 650 1997-2016 ; 1100 1999-2009
Bolt : 2014-
Niken : 2018-
TMAX : 2001-
XMAX : 2005-
NMAX : 2015-
Aerox : 1997-
BW's : 1990-
FJR 1300 : 2001-2021
YZ 125 : 1974-
YZ 250 F : 2001-
WR 450 F : 2003-

@ Honda | JP | moto
CBR 900 RR : SC28 1992-1995 ; SC33 1996-1999 ; SC44 2000-2001 ; SC50 2002-2003
CBR 600 F : PC19 1987-1990 ; PC25 1991-1994 ; PC31 1995-1998 ; PC35 1999-2006 ; PC41 2011-2013
CBR 650 R : 2019-
CBR 1100 XX : 1996-2007
CBR 125 R : 2004-2017
CBR 500 R : 2013-
VFR 750 R : RC30 1987-1990
VFR 750 F : 1986-1997
VFR 800 : 1998-2017
NR 750 : 1992-1993
NSR 125 : 1988-2003
CB 125 F : 2015-
CB 500 : 1993-2003
CB 500 F : 2013-
CB 650 R : 2019-
CB 1000 R : SC60 2008-2017 ; SC80 2018-
CB 1300 : 2003-2020
CBX 1000 : 1978-1982
CB 900 F Bol d'Or : 1979-1983
Hornet : CB 600 F 1998-2013 ; CB 750 2023-
Africa Twin : XRV 650 1988-1989 ; XRV 750 1990-2003 ; CRF 1000 L 2016-2019 ; CRF 1100 L 2020-
Transalp : XL 600 V 1987-2000 ; XL 650 V 2000-2007 ; XL 700 V 2008-2012 ; XL 750 2023-
Dominator : NX 650 1988-2002
XR 600 R : 1985-2000
NC 750 X : NC 700 X 2012-2013 ; NC 750 X 2014-
Deauville : 1998-2013
Gold Wing : GL 1000 1975-1979 ; GL 1100 1980-1983 ; GL 1200 1984-1987 ; GL 1500 1988-2000 ; GL 1800 2001-
Shadow : VT 600 1988-2007 ; VT 750 1997-2016
Rebel : CMX 500 2017- ; CMX 1100 2021-
X-ADV : 2017-
Forza : 125 2015- ; 750 2021-
PCX : 2010-
SH : 125 2001- ; 300 2007-
MSX 125 : 2013-
Monkey : Z50 1967-1999 ; Moderne 2018-
Dax : ST 50 1969-1999 ; Moderne 2023-
CRF 250 L : 2012-
CRF 450 R : 2002-

@ Kawasaki | JP | moto
H1 Mach III : 1969-1975
H2 Mach IV : 1972-1975
Z 1000 (1977) : 1977-1980
Z 1300 : 1979-1989
GPZ 900 R : 1984-1996
GPZ 500 S : 1987-2009
ZZR 1100 : 1990-2001
ZZR 1400 : 2006-2020
ZX-6R : 1995-
ZX-7R : 1996-2003
ZX-9R : 1994-2003
ZX-12R : 2000-2006
ZX-4RR : 2023-
Ninja H2 : 2015-
Ninja 400 : 2018-
Ninja 650 : ER-6f 2006-2016 ; Ninja 650 2017-
Ninja 1000 SX : Z1000SX 2011-2019 ; Ninja 1000 SX 2020-
Z125 : 2019-
Z400 : 2019-
Z650 : 2017-
Z750 : 2004-2012
Z800 : 2013-2016
Z H2 : 2020-
Z900 RS : 2018-
ER-6n : 2006-2016
Versys 650 : 2006-
Versys 1000 : 2012-
W800 : 2011-
Vulcan S : 2015-
VN 900 : 2006-2021
KLR 650 : 1987-
KLX 125 : 2003-
KX 250 : 1974-

@ Suzuki | JP | moto
GSX-R 600 : 1997-
GSX-R 750 : 1985-
GSX-R 1100 : 1986-1998
GSX-R 125 : 2017-
GSX 1100 S Katana : 1981-1987
Katana : 2019-
GSX-S 750 : 2015-2021
GSX-S 1000 : 2015-
GSX-8S : 2023-
SV 650 : 1999-
SV 1000 : 2003-2007
TL 1000 S : 1997-2001
TL 1000 R : 1998-2003
Bandit : GSF 600 1995-2004 ; GSF 650 2005-2016 ; GSF 1200 1996-2006 ; GSF 1250 2007-2016
GS 500 : 1989-2008
DR 650 : 1990-
DR-Z 400 : 2000-
DR Big : 1988-1999
V-Strom 650 : 2004-
V-Strom 800 : 2023-
V-Strom 1000 : 2002-2020
V-Strom 1050 : 2020-
Intruder : 1985-2008
Burgman : 125 2002- ; 400 1998- ; 650 2002-
GN 125 : 1982-2001
RG 500 Gamma : 1985-1987
RM-Z 250 : 2004-

# --- Europe -----------------------------------------------------------------------------------------------------

@ BMW | DE | moto
R 69 S : 1960-1969
R 75/5 : 1969-1973
R 90 S : 1973-1976
R 100 RS : 1976-1984
R 80 G/S : 1980-1987
R 100 GS : 1987-1996
K 100 : 1983-1992
K 1 : 1988-1993
R 1100 GS : 1994-1999
R 1150 GS : 1999-2004
R 1200 GS : Refroidie par air 2004-2012 ; LC 2013-2018
R 1250 GS : 2019-2023
R 1300 GS : 2023-
R 1200 RT : 2005-2018
R 1250 RT : 2019-
R 1200 R : 2006-2018
R 1200 C : 1997-2004
R 18 : 2020-
F 650 GS : 2000-2007
F 800 GS : 2008-2018
F 800 R : 2009-2019
F 900 R : 2020-
F 900 XR : 2020-
G 310 R : 2016-
G 310 GS : 2017-
S 1000 R : 2014-
S 1000 XR : 2015-
M 1000 RR : 2020-
K 1300 S : 2009-2016
K 1600 GT : 2011-
C 400 X : 2018-
CE 04 : 2022-
HP2 : 2005-2010

@ Ducati | IT | moto
851 : 1987-1992
888 : 1993-1994
748 : 1995-2002
749 : 2003-2006
999 : 2003-2006
848 : 2008-2013
1098 : 2007-2009
1198 : 2009-2011
SuperSport : SS 1988-2007 ; 939/950 2017-
Paso : 1986-1990
Multistrada : 1000/1100 2003-2009 ; 1200 2010-2017 ; 1260 2018-2020 ; V4 2021- ; V2 2022-
Hypermotard : 1100 2007-2012 ; 821 2013-2015 ; 939 2016-2018 ; 950 2019- ; 698 Mono 2024-
Scrambler : 2015-
Diavel : I 2011-2018 ; 1260 2019-2022 ; V4 2023-
XDiavel : 2016-
Streetfighter : 1098 2009-2013 ; V4 2020- ; V2 2022-
DesertX : 2022-
Sport Classic : 2006-2009

@ Aprilia | IT | moto
RS 50 : 1993-
RS 125 : 1992-
RS 250 : 1995-2002
RS 457 : 2024-
RS 660 : 2020-
RSV Mille : 1998-2003
RSV 1000 R : 2004-2008
RSV4 : 2009-
Tuono : 1000 2002-2010 ; V4 2011- ; 660 2021-
Tuareg 660 : 2021-
Shiver : 2007-2020
Dorsoduro : 2008-2017
Pegaso : 1990-2010
Caponord : 2001-2007
SR 50 : 1992-
SX 125 : 2018-

@ MV Agusta | IT | moto
750 S : 1971-1975
F4 : 1999-2019
Brutale : 2001-
F3 : 2012-
Dragster : 2014-
Turismo Veloce : 2014-
Superveloce : 2020-
Enduro Veloce : 2023-

@ Moto Guzzi | IT | moto
V7 : Classique 1967-1976 ; Moderne 2008-
Le Mans : 1976-1993
California : 1971-
V11 : 1999-2005
Griso : 2005-2016
Stelvio : 2008-2016
V85 TT : 2019-
V100 Mandello : 2022-
Breva : 2003-2012

@ Benelli | IT | moto
Sei : 1974-1989
TNT 1130 : 2004-2016
Leoncino 500 : 2017-
TRK 502 : 2017-

@ Bimota | IT | moto
DB5 : 2005-2011
Tesi : 1990-

@ Laverda | IT | moto
750 SF : 1971-1976
Jota : 1976-1982

@ Vespa | IT | moto
50 Special : 1969-1983
Primavera : Classique 1968-1983 ; Moderne 2013-
PX : 1977-2017
ET4 : 1996-2005
LX : 2005-2013
GTS : 2003-
Sprint : 2014-
Elettrica : 2018-

@ Piaggio | IT | moto
Ciao : 1967-2006
Zip : 1992-
Typhoon : 1993-
MP3 : 2006-
Liberty : 1997-
Beverly : 2001-
X9 : 2000-2008

@ Gilera | IT | moto
Runner : 1997-
Nexus : 2003-2015

@ KTM | AT | moto
125 Duke : 2011-
390 Duke : 2013-
690 Duke : 2008-2019
790 Duke : 2018-
890 Duke : 2020-
990 Super Duke : 2005-2013
1290 Super Duke R : 2014-2023
1390 Super Duke R : 2024-
RC 390 : 2014-
390 Adventure : 2019-
790 Adventure : 2019-
890 Adventure : 2021-
990 Adventure : 2006-2013
1090 Adventure : 2017-2019
1190 Adventure : 2013-2016
1290 Super Adventure : 2015-
690 SMC R : 2008-
690 Enduro R : 2008-
EXC : 1998-
SX : 1990-
X-Bow [car] : 2008-

@ Husqvarna | SE | moto
Vitpilen : 2018-
Svartpilen : 2018-
Norden 901 : 2022-
701 Enduro : 2016-
TE : 1990-
FE : 2014-

@ Triumph | GB | moto
Trident T150 : 1968-1975
Speed Triple : 1994-
Daytona 675 : 2006-2017
Daytona 955i : 1997-2006
Trident 660 : 2021-
Tiger 800 : 2010-2019
Tiger 900 : 2020-
Tiger 1200 : 2012-
Tiger 1050 : 2007-2013
Thruxton : 2004-
Speed Twin : 2018-
Street Twin : 2016-
Scrambler 1200 : 2019-
Scrambler 400 X : 2023-
Speed 400 : 2023-
Rocket 3 : Rocket III 2004-2018 ; Rocket 3 2019-
Sprint ST : 1999-2010
America : 2002-2016

@ Norton | GB | moto
Commando : 750 1967-1977 ; 961 2010-
Dominator : 1949-1970

@ BSA | GB | moto
Gold Star : Classique 1938-1963 ; Moderne 2021-

@ Royal Enfield | IN | moto
Bullet : 350 1932- ; 500 1953-2020
Classic 350 : 2009-
Classic 500 : 2009-2020
Interceptor 650 : 2018-
Continental GT : 2013-
Himalayan : 411 2016-2023 ; 450 2024-
Meteor 350 : 2020-
Hunter 350 : 2022-
Scram 411 : 2022-
Super Meteor 650 : 2023-
Guerrilla 450 : 2024-
Shotgun 650 : 2024-

@ Peugeot | FR | moto
103 : 1971-2011
Speedfight : 1997-
Ludix : 2004-
Django : 2014-
Kisbee : 2010-

@ MBK | FR | moto
51 : 1978-2002
Booster : 1990-
Nitro : 1997-
Ovetto : 1997-

@ Motobécane | FR | moto
Mobylette : AV88 1960-1997
125 LT : 1973-1980

@ Solex | FR | moto
3800 : 1966-1988

@ Voxan | FR | moto
Roadster : 1999-2003

@ Bultaco | ES | moto
Sherpa T : 1964-1983

@ Derbi | ES | moto
Senda : 1995-
GPR : 1997-2015

@ Rieju | ES | moto
MRT : 2008-

@ Beta | IT | moto
RR : 2005-

@ Sherco | FR | moto
SE : 2005-

# --- Amérique, Asie ------------------------------------------------------------------------------------------------

@ Harley-Davidson | US | moto
Sportster : Ironhead 1957-1985 ; Evolution 1986-2022 ; S 2021-
Iron 883 : 2009-2022
Forty-Eight : 2010-2022
Nightster : 2022-
Dyna : 1991-2017
Softail : 1984-
Fat Boy : 1990-
Heritage Classic : 1986-
Fat Bob : 2008-
Street Bob : 2006-
Low Rider : 1977-
Breakout : 2013-
Road King : 1994-
Electra Glide : 1965-
Street Glide : 2006-
Road Glide : 1998-
V-Rod : 2001-2017
Street 750 : 2014-2020
Pan America : 2021-
X 350 : 2023-

@ Indian | US | moto
Scout : Classique 1920-1949 ; Moderne 2015-
Chief : Classique 1922-1953 ; Moderne 2014-
Chieftain : 2014-
FTR : 2019-

@ Victory | US | moto
Vegas : 1999-2017

@ Buell | US | moto
XB : 2002-2010

@ Kymco | TW | moto
Agility : 2005-
AK 550 : 2017-
Like : 2009-

@ SYM | TW | moto
Fiddle : 2008-
Orbit : 2007-

@ CFMOTO | CN | moto
700CL-X : 2021-
800MT : 2021-

@ Zero | US | moto
SR/F : 2019-
`;
