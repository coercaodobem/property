(function(){var e=e=>e/2**32|0,t=e=>e>>>0;function n(n,r,i,a){let o=e(i),s=t(i);n.setUint32(r,a?s:o,a),n.setUint32(r+4,a?o:s,a)}function r(e){return e instanceof Uint8Array||ArrayBuffer.isView(e)&&e.constructor.name===`Uint8Array`&&`BYTES_PER_ELEMENT`in e&&e.BYTES_PER_ELEMENT===1}var i=e=>e?`"${e}" `:``;function a(e,t=``){if(typeof e!=`number`)throw TypeError(i(t)+`expected number, got `+typeof e);if(!Number.isSafeInteger(e)||e<0)throw RangeError(i(t)+`expected integer >= 0, got `+e);return e}function o(e,t,n=``){if(r(e)&&(t===void 0||e.length===t))return e;t!==void 0&&a(t,`length`);let o=r(e),s=t===void 0?``:` of length ${t}`,c=o?`length=${e.length}`:`type=${typeof e}`,l=i(n)+`expected Uint8Array`+s+`, got `+c;throw o?RangeError(l):TypeError(l)}var s=(e,t)=>{if(typeof e!=`object`||!e||Array.isArray(e))throw TypeError((t===`object`?``:`"${t}" `)+`expected object, got type=`+typeof e)},c=(e,t)=>{s(e,t);let n=Object.getPrototypeOf(e);if(n!==Object.prototype&&n!==null)throw TypeError(`"${t}" expected plain object`);if(Object.hasOwn(e,`__proto__`))throw TypeError(`"${t}.__proto__" is not allowed`)};function l(e,t=!0){if(e.destroyed)throw Error(`hash was destroyed`);if(t&&e.finished)throw Error(`digest() was already called`)}function u(e,t){o(e,void 0,`output`);let n=t.outputLen;if(!(e.length>=n))throw RangeError(`"output" expected length >= `+n)}function d(...e){for(let t=0;t<e.length;t++)e[t].fill(0)}function f(e){return new DataView(e.buffer,e.byteOffset,e.byteLength)}function p(e,t){return e<<32-t|e>>>t}function ee(e,t,n=`opts`){return c(e,`defaults`),t!==void 0&&c(t,n),Object.assign(Object.create(null),e,t)}function te(e,t={}){if(typeof e!=`function`)throw TypeError(`"hashCons" expected function, got type=`+typeof e);t=ee({},t,`info`);let n=(t,n)=>e(n).update(t).digest(),r=e(void 0);return n.outputLen=r.outputLen,n.blockLen=r.blockLen,n.canXOF=r.canXOF,n.create=t=>e(t),Object.assign(n,t),Object.freeze(n)}var ne=e=>({oid:Uint8Array.from([6,9,96,134,72,1,101,3,4,2,e])});function m(e,t,n){return e&t^~e&n}function h(e,t,n){return e&t^e&n^t&n}var g=class{blockLen;outputLen;canXOF=!1;padOffset;isLE;buffer;view;finished=!1;length=0;pos=0;destroyed=!1;constructor(e,t,n,r){this.blockLen=e,this.outputLen=t,this.padOffset=n,this.isLE=r,this.buffer=new Uint8Array(e),this.view=f(this.buffer)}update(e){l(this),o(e);let{view:t,buffer:n,blockLen:r}=this,i=e.length,a=!1;for(let o=0;o<i;){let s=Math.min(r-this.pos,i-o);if(s===r){let t=f(e);for(;r<=i-o;o+=r)this.process(t,o);a=!0;continue}n.set(o===0&&s===i?e:e.subarray(o,o+s),this.pos),this.pos+=s,o+=s,this.pos===r&&(this.process(t,0),this.pos=0,a=!0)}return this.length+=e.length,a&&this.roundClean(),this}digestInto(e){l(this),u(e,this),this.finished=!0;let{buffer:t,view:r,blockLen:i,isLE:a}=this,{pos:o}=this;t[o++]=128,t.fill(0,o),this.padOffset>i-o&&(this.process(r,0),t.fill(0)),n(r,i-8,this.length*8,a),this.process(r,0),this.roundClean();let s=e===t?r:f(e),c=this.outputLen,d=c/4,p=this.get();if(c%4||d>p.length)throw Error(`invalid outputLen`);for(let e=0;e<d;e++)s.setUint32(4*e,p[e],a)}digest(){let{buffer:e,outputLen:t}=this;this.digestInto(e);let n=e.slice(0,t);return this.destroy(),n}_cloneIntoMeta(e){let{buffer:t,length:n,finished:r,destroyed:i,pos:a}=this;return e.destroyed=i,e.finished=r,e.length=n,e.pos=a,a&&e.buffer.set(t),e}clone(){return this._cloneInto()}},re=Uint32Array.from([1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225]),ie=Uint32Array.from([1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298]),_=new Uint32Array(64),ae=class extends g{A=0;B=0;C=0;D=0;E=0;F=0;G=0;H=0;constructor(e,t){super(64,e,8,!1),this.A=t[0]|0,this.B=t[1]|0,this.C=t[2]|0,this.D=t[3]|0,this.E=t[4]|0,this.F=t[5]|0,this.G=t[6]|0,this.H=t[7]|0}get(){let{A:e,B:t,C:n,D:r,E:i,F:a,G:o,H:s}=this;return[e,t,n,r,i,a,o,s]}set(e,t,n,r,i,a,o,s){this.A=e|0,this.B=t|0,this.C=n|0,this.D=r|0,this.E=i|0,this.F=a|0,this.G=o|0,this.H=s|0}_cloneInto(e){return(e||=new this.constructor).set(...this.get()),this._cloneIntoMeta(e)}process(e,t){for(let n=0;n<16;n++,t+=4)_[n]=e.getUint32(t,!1);for(let e=16;e<64;e++){let t=_[e-15],n=_[e-2],r=p(t,7)^p(t,18)^t>>>3,i=p(n,17)^p(n,19)^n>>>10;_[e]=i+_[e-7]+r+_[e-16]|0}let{A:n,B:r,C:i,D:a,E:o,F:s,G:c,H:l}=this;for(let e=0;e<64;e++){let t=p(o,6)^p(o,11)^p(o,25),u=l+t+m(o,s,c)+ie[e]+_[e]|0,d=(p(n,2)^p(n,13)^p(n,22))+h(n,r,i)|0;l=c,c=s,s=o,o=a+u|0,a=i,i=r,r=n,n=u+d|0}n=n+this.A|0,r=r+this.B|0,i=i+this.C|0,a=a+this.D|0,o=o+this.E|0,s=s+this.F|0,c=c+this.G|0,l=l+this.H|0,this.set(n,r,i,a,o,s,c,l)}roundClean(){d(_)}destroy(){this.destroyed=!0,this.set(0,0,0,0,0,0,0,0),d(this.buffer)}},oe=class extends ae{constructor(){super(32,re)}},v=te(()=>new oe,ne(1)),se=e=>Object.freeze(e());function y(e){return e instanceof Uint8Array||ArrayBuffer.isView(e)&&e.constructor.name===`Uint8Array`&&`BYTES_PER_ELEMENT`in e&&e.BYTES_PER_ELEMENT===1}function b(e){if(!y(e))throw TypeError(`Uint8Array expected`)}function x(e){if(typeof e!=`function`)throw TypeError(`function expected`);return!0}function S(e,t){if(typeof t!=`string`)throw TypeError(`${e}: string expected`);return!0}function C(e,t=`number`){if(typeof e!=`number`)throw TypeError(`${t}: expected number, got ${typeof e}`);if(!Number.isSafeInteger(e))throw RangeError(`${t}: expected safe integer, got ${e}`)}function w(...e){let t=e=>e,n=(e,t)=>n=>e(t(n));return{encode:e.map(e=>e.encode).reduceRight(n,t),decode:e.map(e=>e.decode).reduce(n,t)}}var T=(()=>{try{let e=new TextDecoder;return e.decode(Uint8Array.of(65,48,43,127))===`A0+`?e:void 0}catch{return}})(),E=8192;function ce(e){let t=e.length;if(T!==void 0&&t>=12)return T.decode(e);if(t<=E)return String.fromCharCode.apply(null,e);let n=``;for(let r=0;r<t;r+=E)n+=String.fromCharCode.apply(null,e.subarray(r,r+E));return n}function le(e,t){let n=e.length;if(n>128)throw Error(`alphabet: max 128 letters`);let r=new Uint8Array(n),i=new Int8Array(128).fill(-1);for(let t=0;t<n;t++){let n=e.charCodeAt(t);if(e.codePointAt(t)!==n||n>127)throw Error(`alphabet: single-char ASCII letters only`);r[t]=n,i[n]=t}if(t!==void 0)for(let e of Object.keys(t)){let n=e.charCodeAt(0),r=i[t[e].charCodeAt(0)];if(e.length!==1||n>127||r===void 0||r===-1)throw Error(`alphabet: invalid alias ${e}`);i[n]=r}return{encode:e=>{let t=new Uint8Array(e.length);for(let n=0;n<e.length;n++){let i=e[n],a=r[i];if(a===void 0)throw Error(`alphabet.encode: invalid digit ${i}`);t[n]=a}return ce(t)},decode:t=>{S(`decode`,t);let n=t.length,r=new Uint8Array(n);for(let a=0;a<n;a++){let n=t.charCodeAt(a),o=n<128?i[n]:-1;if(o===-1)throw Error(`Unknown letter "${t[a]}". Allowed: ${e}`);r[a]=o}return r}}}function ue(e,t){if(C(e),e<=0)throw RangeError(`checksum length must be positive: ${e}`);x(t);let n=t;return{encode(t){b(t);let r=n(t).slice(0,e),i=new Uint8Array(t.length+e);return i.set(t),i.set(r,t.length),i},decode(t){b(t);let r=t.slice(0,-e),i=t.slice(-e),a=n(r).slice(0,e);for(let t=0;t<e;t++)if(a[t]!==i[t])throw Error(`Invalid checksum`);return r}}}var de=656356768,D=65536,fe=2048,pe=4096,me=(e,t)=>({encode:n=>{b(n);let r=n.length;if(r===0)return new Uint8Array;if(r>=D)throw Error(`invalid length`);let i=0;for(;i<r-1&&n[i]===0;)i++;let a=Math.ceil(r/2),o=new Uint16Array(a),s=r&1;s&&(o[0]=n[0]);for(let e=s,t=s;e<r;e+=2,t++)o[t]=n[e]<<8|n[e+1];let c=[],l=0;for(;l<a;){let e=0;for(let n=l;n<a;n++){let r=e*65536+o[n],i=Math.floor(r/t);e=r-i*t,o[n]=i,i===0&&n===l&&l++}c.push(e)}let u=c.length-1,d=u*5;for(let t=c[u];d++,!(t<e);t=Math.floor(t/e));let f=new Uint8Array(i+d),p=f.length-1;for(let t=0;t<u;t++){let n=c[t];for(let t=0;t<5;t++)f[p--]=n%e,n=Math.floor(n/e)}for(let t=c[u];p>=i;t=Math.floor(t/e))f[p--]=t%e;return f},decode:t=>{b(t);let n=t.length;if(n===0)return new Uint8Array;if(n>=D)throw Error(`invalid length`);let r=0;for(;r<n-1&&t[r]===0;)r++;let i=new Uint16Array(Math.ceil(n*6/16)+1),a=0,o=0,s=n%5||5;for(;o<n;){let n=0,r=1;for(let i=o+s;o<i;o++){let i=t[o];if(i>=e)throw Error(`invalid integer: ${i}`);n=n*e+i,r*=e}s=5;let c=n;for(let e=0;e<a;e++){let t=i[e]*r+c;c=Math.floor(t/65536),i[e]=t-c*65536}for(;c>0;c=Math.floor(c/65536))i[a++]=c%65536}let c=a===0?1:a*2-(i[a-1]<256),l=new Uint8Array(r+c),u=l.length-1;for(let e=0;e<a;e++){let t=i[e];l[u--]=t&255,u>=r&&(l[u--]=t>>8)}return l}}),he=(e,t)=>{let n=le(t);return{encode(t){if(b(t),t.length>fe)throw Error(`invalid length`);return n.encode(e.encode(t))},decode(t){if(S(`baseN.decode`,t),t.length>pe)throw Error(`invalid length`);return e.decode(n.decode(t))}}},O=me(58,de),k=e=>he(O,e),A=se(()=>k(`123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz`)),j=e=>{x(e);let t=e;return w(ue(4,e=>t(t(e))),A)},M=Object.freeze(`abandon
ability
able
about
above
absent
absorb
abstract
absurd
abuse
access
accident
account
accuse
achieve
acid
acoustic
acquire
across
act
action
actor
actress
actual
adapt
add
addict
address
adjust
admit
adult
advance
advice
aerobic
affair
afford
afraid
again
age
agent
agree
ahead
aim
air
airport
aisle
alarm
album
alcohol
alert
alien
all
alley
allow
almost
alone
alpha
already
also
alter
always
amateur
amazing
among
amount
amused
analyst
anchor
ancient
anger
angle
angry
animal
ankle
announce
annual
another
answer
antenna
antique
anxiety
any
apart
apology
appear
apple
approve
april
arch
arctic
area
arena
argue
arm
armed
armor
army
around
arrange
arrest
arrive
arrow
art
artefact
artist
artwork
ask
aspect
assault
asset
assist
assume
asthma
athlete
atom
attack
attend
attitude
attract
auction
audit
august
aunt
author
auto
autumn
average
avocado
avoid
awake
aware
away
awesome
awful
awkward
axis
baby
bachelor
bacon
badge
bag
balance
balcony
ball
bamboo
banana
banner
bar
barely
bargain
barrel
base
basic
basket
battle
beach
bean
beauty
because
become
beef
before
begin
behave
behind
believe
below
belt
bench
benefit
best
betray
better
between
beyond
bicycle
bid
bike
bind
biology
bird
birth
bitter
black
blade
blame
blanket
blast
bleak
bless
blind
blood
blossom
blouse
blue
blur
blush
board
boat
body
boil
bomb
bone
bonus
book
boost
border
boring
borrow
boss
bottom
bounce
box
boy
bracket
brain
brand
brass
brave
bread
breeze
brick
bridge
brief
bright
bring
brisk
broccoli
broken
bronze
broom
brother
brown
brush
bubble
buddy
budget
buffalo
build
bulb
bulk
bullet
bundle
bunker
burden
burger
burst
bus
business
busy
butter
buyer
buzz
cabbage
cabin
cable
cactus
cage
cake
call
calm
camera
camp
can
canal
cancel
candy
cannon
canoe
canvas
canyon
capable
capital
captain
car
carbon
card
cargo
carpet
carry
cart
case
cash
casino
castle
casual
cat
catalog
catch
category
cattle
caught
cause
caution
cave
ceiling
celery
cement
census
century
cereal
certain
chair
chalk
champion
change
chaos
chapter
charge
chase
chat
cheap
check
cheese
chef
cherry
chest
chicken
chief
child
chimney
choice
choose
chronic
chuckle
chunk
churn
cigar
cinnamon
circle
citizen
city
civil
claim
clap
clarify
claw
clay
clean
clerk
clever
click
client
cliff
climb
clinic
clip
clock
clog
close
cloth
cloud
clown
club
clump
cluster
clutch
coach
coast
coconut
code
coffee
coil
coin
collect
color
column
combine
come
comfort
comic
common
company
concert
conduct
confirm
congress
connect
consider
control
convince
cook
cool
copper
copy
coral
core
corn
correct
cost
cotton
couch
country
couple
course
cousin
cover
coyote
crack
cradle
craft
cram
crane
crash
crater
crawl
crazy
cream
credit
creek
crew
cricket
crime
crisp
critic
crop
cross
crouch
crowd
crucial
cruel
cruise
crumble
crunch
crush
cry
crystal
cube
culture
cup
cupboard
curious
current
curtain
curve
cushion
custom
cute
cycle
dad
damage
damp
dance
danger
daring
dash
daughter
dawn
day
deal
debate
debris
decade
december
decide
decline
decorate
decrease
deer
defense
define
defy
degree
delay
deliver
demand
demise
denial
dentist
deny
depart
depend
deposit
depth
deputy
derive
describe
desert
design
desk
despair
destroy
detail
detect
develop
device
devote
diagram
dial
diamond
diary
dice
diesel
diet
differ
digital
dignity
dilemma
dinner
dinosaur
direct
dirt
disagree
discover
disease
dish
dismiss
disorder
display
distance
divert
divide
divorce
dizzy
doctor
document
dog
doll
dolphin
domain
donate
donkey
donor
door
dose
double
dove
draft
dragon
drama
drastic
draw
dream
dress
drift
drill
drink
drip
drive
drop
drum
dry
duck
dumb
dune
during
dust
dutch
duty
dwarf
dynamic
eager
eagle
early
earn
earth
easily
east
easy
echo
ecology
economy
edge
edit
educate
effort
egg
eight
either
elbow
elder
electric
elegant
element
elephant
elevator
elite
else
embark
embody
embrace
emerge
emotion
employ
empower
empty
enable
enact
end
endless
endorse
enemy
energy
enforce
engage
engine
enhance
enjoy
enlist
enough
enrich
enroll
ensure
enter
entire
entry
envelope
episode
equal
equip
era
erase
erode
erosion
error
erupt
escape
essay
essence
estate
eternal
ethics
evidence
evil
evoke
evolve
exact
example
excess
exchange
excite
exclude
excuse
execute
exercise
exhaust
exhibit
exile
exist
exit
exotic
expand
expect
expire
explain
expose
express
extend
extra
eye
eyebrow
fabric
face
faculty
fade
faint
faith
fall
false
fame
family
famous
fan
fancy
fantasy
farm
fashion
fat
fatal
father
fatigue
fault
favorite
feature
february
federal
fee
feed
feel
female
fence
festival
fetch
fever
few
fiber
fiction
field
figure
file
film
filter
final
find
fine
finger
finish
fire
firm
first
fiscal
fish
fit
fitness
fix
flag
flame
flash
flat
flavor
flee
flight
flip
float
flock
floor
flower
fluid
flush
fly
foam
focus
fog
foil
fold
follow
food
foot
force
forest
forget
fork
fortune
forum
forward
fossil
foster
found
fox
fragile
frame
frequent
fresh
friend
fringe
frog
front
frost
frown
frozen
fruit
fuel
fun
funny
furnace
fury
future
gadget
gain
galaxy
gallery
game
gap
garage
garbage
garden
garlic
garment
gas
gasp
gate
gather
gauge
gaze
general
genius
genre
gentle
genuine
gesture
ghost
giant
gift
giggle
ginger
giraffe
girl
give
glad
glance
glare
glass
glide
glimpse
globe
gloom
glory
glove
glow
glue
goat
goddess
gold
good
goose
gorilla
gospel
gossip
govern
gown
grab
grace
grain
grant
grape
grass
gravity
great
green
grid
grief
grit
grocery
group
grow
grunt
guard
guess
guide
guilt
guitar
gun
gym
habit
hair
half
hammer
hamster
hand
happy
harbor
hard
harsh
harvest
hat
have
hawk
hazard
head
health
heart
heavy
hedgehog
height
hello
helmet
help
hen
hero
hidden
high
hill
hint
hip
hire
history
hobby
hockey
hold
hole
holiday
hollow
home
honey
hood
hope
horn
horror
horse
hospital
host
hotel
hour
hover
hub
huge
human
humble
humor
hundred
hungry
hunt
hurdle
hurry
hurt
husband
hybrid
ice
icon
idea
identify
idle
ignore
ill
illegal
illness
image
imitate
immense
immune
impact
impose
improve
impulse
inch
include
income
increase
index
indicate
indoor
industry
infant
inflict
inform
inhale
inherit
initial
inject
injury
inmate
inner
innocent
input
inquiry
insane
insect
inside
inspire
install
intact
interest
into
invest
invite
involve
iron
island
isolate
issue
item
ivory
jacket
jaguar
jar
jazz
jealous
jeans
jelly
jewel
job
join
joke
journey
joy
judge
juice
jump
jungle
junior
junk
just
kangaroo
keen
keep
ketchup
key
kick
kid
kidney
kind
kingdom
kiss
kit
kitchen
kite
kitten
kiwi
knee
knife
knock
know
lab
label
labor
ladder
lady
lake
lamp
language
laptop
large
later
latin
laugh
laundry
lava
law
lawn
lawsuit
layer
lazy
leader
leaf
learn
leave
lecture
left
leg
legal
legend
leisure
lemon
lend
length
lens
leopard
lesson
letter
level
liar
liberty
library
license
life
lift
light
like
limb
limit
link
lion
liquid
list
little
live
lizard
load
loan
lobster
local
lock
logic
lonely
long
loop
lottery
loud
lounge
love
loyal
lucky
luggage
lumber
lunar
lunch
luxury
lyrics
machine
mad
magic
magnet
maid
mail
main
major
make
mammal
man
manage
mandate
mango
mansion
manual
maple
marble
march
margin
marine
market
marriage
mask
mass
master
match
material
math
matrix
matter
maximum
maze
meadow
mean
measure
meat
mechanic
medal
media
melody
melt
member
memory
mention
menu
mercy
merge
merit
merry
mesh
message
metal
method
middle
midnight
milk
million
mimic
mind
minimum
minor
minute
miracle
mirror
misery
miss
mistake
mix
mixed
mixture
mobile
model
modify
mom
moment
monitor
monkey
monster
month
moon
moral
more
morning
mosquito
mother
motion
motor
mountain
mouse
move
movie
much
muffin
mule
multiply
muscle
museum
mushroom
music
must
mutual
myself
mystery
myth
naive
name
napkin
narrow
nasty
nation
nature
near
neck
need
negative
neglect
neither
nephew
nerve
nest
net
network
neutral
never
news
next
nice
night
noble
noise
nominee
noodle
normal
north
nose
notable
note
nothing
notice
novel
now
nuclear
number
nurse
nut
oak
obey
object
oblige
obscure
observe
obtain
obvious
occur
ocean
october
odor
off
offer
office
often
oil
okay
old
olive
olympic
omit
once
one
onion
online
only
open
opera
opinion
oppose
option
orange
orbit
orchard
order
ordinary
organ
orient
original
orphan
ostrich
other
outdoor
outer
output
outside
oval
oven
over
own
owner
oxygen
oyster
ozone
pact
paddle
page
pair
palace
palm
panda
panel
panic
panther
paper
parade
parent
park
parrot
party
pass
patch
path
patient
patrol
pattern
pause
pave
payment
peace
peanut
pear
peasant
pelican
pen
penalty
pencil
people
pepper
perfect
permit
person
pet
phone
photo
phrase
physical
piano
picnic
picture
piece
pig
pigeon
pill
pilot
pink
pioneer
pipe
pistol
pitch
pizza
place
planet
plastic
plate
play
please
pledge
pluck
plug
plunge
poem
poet
point
polar
pole
police
pond
pony
pool
popular
portion
position
possible
post
potato
pottery
poverty
powder
power
practice
praise
predict
prefer
prepare
present
pretty
prevent
price
pride
primary
print
priority
prison
private
prize
problem
process
produce
profit
program
project
promote
proof
property
prosper
protect
proud
provide
public
pudding
pull
pulp
pulse
pumpkin
punch
pupil
puppy
purchase
purity
purpose
purse
push
put
puzzle
pyramid
quality
quantum
quarter
question
quick
quit
quiz
quote
rabbit
raccoon
race
rack
radar
radio
rail
rain
raise
rally
ramp
ranch
random
range
rapid
rare
rate
rather
raven
raw
razor
ready
real
reason
rebel
rebuild
recall
receive
recipe
record
recycle
reduce
reflect
reform
refuse
region
regret
regular
reject
relax
release
relief
rely
remain
remember
remind
remove
render
renew
rent
reopen
repair
repeat
replace
report
require
rescue
resemble
resist
resource
response
result
retire
retreat
return
reunion
reveal
review
reward
rhythm
rib
ribbon
rice
rich
ride
ridge
rifle
right
rigid
ring
riot
ripple
risk
ritual
rival
river
road
roast
robot
robust
rocket
romance
roof
rookie
room
rose
rotate
rough
round
route
royal
rubber
rude
rug
rule
run
runway
rural
sad
saddle
sadness
safe
sail
salad
salmon
salon
salt
salute
same
sample
sand
satisfy
satoshi
sauce
sausage
save
say
scale
scan
scare
scatter
scene
scheme
school
science
scissors
scorpion
scout
scrap
screen
script
scrub
sea
search
season
seat
second
secret
section
security
seed
seek
segment
select
sell
seminar
senior
sense
sentence
series
service
session
settle
setup
seven
shadow
shaft
shallow
share
shed
shell
sheriff
shield
shift
shine
ship
shiver
shock
shoe
shoot
shop
short
shoulder
shove
shrimp
shrug
shuffle
shy
sibling
sick
side
siege
sight
sign
silent
silk
silly
silver
similar
simple
since
sing
siren
sister
situate
six
size
skate
sketch
ski
skill
skin
skirt
skull
slab
slam
sleep
slender
slice
slide
slight
slim
slogan
slot
slow
slush
small
smart
smile
smoke
smooth
snack
snake
snap
sniff
snow
soap
soccer
social
sock
soda
soft
solar
soldier
solid
solution
solve
someone
song
soon
sorry
sort
soul
sound
soup
source
south
space
spare
spatial
spawn
speak
special
speed
spell
spend
sphere
spice
spider
spike
spin
spirit
split
spoil
sponsor
spoon
sport
spot
spray
spread
spring
spy
square
squeeze
squirrel
stable
stadium
staff
stage
stairs
stamp
stand
start
state
stay
steak
steel
stem
step
stereo
stick
still
sting
stock
stomach
stone
stool
story
stove
strategy
street
strike
strong
struggle
student
stuff
stumble
style
subject
submit
subway
success
such
sudden
suffer
sugar
suggest
suit
summer
sun
sunny
sunset
super
supply
supreme
sure
surface
surge
surprise
surround
survey
suspect
sustain
swallow
swamp
swap
swarm
swear
sweet
swift
swim
swing
switch
sword
symbol
symptom
syrup
system
table
tackle
tag
tail
talent
talk
tank
tape
target
task
taste
tattoo
taxi
teach
team
tell
ten
tenant
tennis
tent
term
test
text
thank
that
theme
then
theory
there
they
thing
this
thought
three
thrive
throw
thumb
thunder
ticket
tide
tiger
tilt
timber
time
tiny
tip
tired
tissue
title
toast
tobacco
today
toddler
toe
together
toilet
token
tomato
tomorrow
tone
tongue
tonight
tool
tooth
top
topic
topple
torch
tornado
tortoise
toss
total
tourist
toward
tower
town
toy
track
trade
traffic
tragic
train
transfer
trap
trash
travel
tray
treat
tree
trend
trial
tribe
trick
trigger
trim
trip
trophy
trouble
truck
true
truly
trumpet
trust
truth
try
tube
tuition
tumble
tuna
tunnel
turkey
turn
turtle
twelve
twenty
twice
twin
twist
two
type
typical
ugly
umbrella
unable
unaware
uncle
uncover
under
undo
unfair
unfold
unhappy
uniform
unique
unit
universe
unknown
unlock
until
unusual
unveil
update
upgrade
uphold
upon
upper
upset
urban
urge
usage
use
used
useful
useless
usual
utility
vacant
vacuum
vague
valid
valley
valve
van
vanish
vapor
various
vast
vault
vehicle
velvet
vendor
venture
venue
verb
verify
version
very
vessel
veteran
viable
vibrant
vicious
victory
video
view
village
vintage
violin
virtual
virus
visa
visit
visual
vital
vivid
vocal
voice
void
volcano
volume
vote
voyage
wage
wagon
wait
walk
wall
walnut
want
warfare
warm
warrior
wash
wasp
waste
water
wave
way
wealth
weapon
wear
weasel
weather
web
wedding
weekend
weird
welcome
west
wet
whale
what
wheat
wheel
when
where
whip
whisper
wide
width
wife
wild
will
win
window
wine
wing
wink
winner
winter
wire
wisdom
wise
wish
witness
wolf
woman
wonder
wood
wool
word
work
world
worry
worth
wrap
wreck
wrestle
wrist
write
wrong
yard
year
yellow
you
young
youth
zebra
zero
zone
zoo`.split(`
`)),N=`abbey abducts ability ablaze abnormal abort abrasive absorb abyss academy aces aching acidic acoustic acquire across
actress acumen adapt addicted adept adhesive adjust adopt adrenalin adult adventure aerial afar affair afield afloat
afoot afraid after against agenda aggravate agile aglow agnostic agony agreed ahead aided ailments aimless airport
aisle ajar akin alarms album alchemy alerts algebra alkaline alley almost aloof alpine already also altitude alumni
always amaze ambush amended amidst ammo amnesty among amply amused anchor android anecdote angled ankle annoyed
answers antics anvil anxiety anybody apart apex aphid aplomb apology apply apricot aptitude aquarium arbitrary
archer ardent arena argue arises army around arrow arsenic artistic ascend ashtray aside asked asleep aspire
assorted asylum athlete atlas atom atrium attire auburn auctions audio august aunt austere autumn avatar avidly
avoid awakened awesome awful awkward awning awoken axes axis axle aztec azure baby bacon badge baffles bagpipe
bailed bakery balding bamboo banjo baptism basin batch bawled bays because beer befit begun behind being below
bemused benches berries bested betting bevel beware beyond bias bicycle bids bifocals biggest bikini bimonthly
binocular biology biplane birth biscuit bite biweekly blender blip bluntly boat bobsled bodies bogeys boil boldly
bomb border boss both bounced bovine bowling boxes boyfriend broken brunt bubble buckets budget buffet bugs building
bulb bumper bunch business butter buying buzzer bygones byline bypass cabin cactus cadets cafe cage cajun cake
calamity camp candy casket catch cause cavernous cease cedar ceiling cell cement cent certain chlorine chrome cider
cigar cinema circle cistern citadel civilian claim click clue coal cobra cocoa code coexist coffee cogs cohesive
coils colony comb cool copy corrode costume cottage cousin cowl criminal cube cucumber cuddled cuffs cuisine cunning
cupcake custom cycling cylinder cynical dabbing dads daft dagger daily damp dangerous dapper darted dash dating
dauntless dawn daytime dazed debut decay dedicated deepest deftly degrees dehydrate deity dejected delayed
demonstrate dented deodorant depth desk devoid dewdrop dexterity dialect dice diet different digit dilute dime
dinner diode diplomat directed distance ditch divers dizzy doctor dodge does dogs doing dolphin domestic donuts
doorway dormant dosage dotted double dove down dozen dreams drinks drowning drunk drying dual dubbed duckling dude
duets duke dullness dummy dunes duplex duration dusted duties dwarf dwelt dwindling dying dynamite dyslexic each
eagle earth easy eating eavesdrop eccentric echo eclipse economics ecstatic eden edgy edited educated eels efficient
eggs egotistic eight either eject elapse elbow eldest eleven elite elope else eluded emails ember emerge emit
emotion empty emulate energy enforce enhanced enigma enjoy enlist enmity enough enraged ensign entrance envy epoxy
equip erase erected erosion error eskimos espionage essential estate etched eternal ethics etiquette evaluate
evenings evicted evolved examine excess exhale exit exotic exquisite extra exult fabrics factual fading fainted
faked fall family fancy farming fatal faulty fawns faxed fazed feast february federal feel feline females fences
ferry festival fetches fever fewest fiat fibula fictional fidget fierce fifteen fight films firm fishing fitting
five fixate fizzle fleet flippant flying foamy focus foes foggy foiled folding fonts foolish fossil fountain fowls
foxes foyer framed friendly frown fruit frying fudge fuel fugitive fully fuming fungal furnished fuselage future
fuzzy gables gadget gags gained galaxy gambit gang gasp gather gauze gave gawk gaze gearbox gecko geek gels gemstone
general geometry germs gesture getting geyser ghetto ghost giant giddy gifts gigantic gills gimmick ginger girth
giving glass gleeful glide gnaw gnome goat goblet godfather goes goggles going goldfish gone goodbye gopher gorilla
gossip gotten gourmet governing gown greater grunt guarded guest guide gulp gumball guru gusts gutter guys gymnast
gypsy gyrate habitat hacksaw haggled hairy hamburger happens hashing hatchet haunted having hawk haystack hazard
hectare hedgehog heels hefty height hemlock hence heron hesitate hexagon hickory hiding highway hijack hiker hills
himself hinder hippo hire history hitched hive hoax hobby hockey hoisting hold honked hookup hope hornet hospital
hotel hounded hover howls hubcaps huddle huge hull humid hunter hurried husband huts hybrid hydrogen hyper iceberg
icing icon identity idiom idled idols igloo ignore iguana illness imagine imbalance imitate impel inactive inbound
incur industrial inexact inflamed ingested initiate injury inkling inline inmate innocent inorganic input inquest
inroads insult intended inundate invoke inwardly ionic irate iris irony irritate island isolated issued italics
itches items itinerary itself ivory jabbed jackets jaded jagged jailed jamming january jargon jaunt javelin jaws
jazz jeans jeers jellyfish jeopardy jerseys jester jetting jewels jigsaw jingle jittery jive jobs jockey jogger
joining joking jolted jostle journal joyous jubilee judge juggled juicy jukebox july jump junk jury justice juvenile
kangaroo karate keep kennel kept kernels kettle keyboard kickoff kidneys king kiosk kisses kitchens kiwi knapsack
knee knife knowledge knuckle koala laboratory ladder lagoon lair lakes lamb language laptop large last later
launching lava lawsuit layout lazy lectures ledge leech left legion leisure lemon lending leopard lesson lettuce
lexicon liar library licks lids lied lifestyle light likewise lilac limits linen lion lipstick liquid listen lively
loaded lobster locker lodge lofty logic loincloth long looking lopped lordship losing lottery loudly love lower
loyal lucky luggage lukewarm lullaby lumber lunar lurk lush luxury lymph lynx lyrics macro madness magically mailed
major makeup malady mammal maps masterful match maul maverick maximum mayor maze meant mechanic medicate meeting
megabyte melting memoir menu merger mesh metro mews mice midst mighty mime mirror misery mittens mixture moat mobile
mocked mohawk moisture molten moment money moon mops morsel mostly motherly mouth movement mowing much muddy muffin
mugged mullet mumble mundane muppet mural musical muzzle myriad mystery myth nabbing nagged nail names nanny napkin
narrate nasty natural nautical navy nearby necklace needed negative neither neon nephew nerves nestle network
neutral never newt nexus nibs niche niece nifty nightly nimbly nineteen nirvana nitrogen nobody nocturnal nodes
noises nomad noodles northern nostril noted nouns novelty nowhere nozzle nuance nucleus nudged nugget nuisance null
number nuns nurse nutshell nylon oaks oars oasis oatmeal obedient object obliged obnoxious observant obtains obvious
occur ocean october odds odometer offend often oilfield ointment okay older olive olympics omega omission omnibus
onboard oncoming oneself ongoing onion online onslaught onto onward oozed opacity opened opposite optical opus
orange orbit orchid orders organs origin ornament orphans oscar ostrich otherwise otter ouch ought ounce ourselves
oust outbreak oval oven owed owls owner oxidant oxygen oyster ozone pact paddles pager pairing palace pamphlet
pancakes paper paradise pastry patio pause pavements pawnshop payment peaches pebbles peculiar pedantic peeled pegs
pelican pencil people pepper perfect pests petals phase pheasants phone phrases physics piano picked pierce pigment
piloted pimple pinched pioneer pipeline pirate pistons pitched pivot pixels pizza playful pledge pliers plotting
plus plywood poaching pockets podcast poetry point poker polar ponies pool popular portents possible potato pouch
poverty powder pram present pride problems pruned prying psychic public puck puddle puffin pulp pumpkins punch puppy
purged push putty puzzled pylons pyramid python queen quick quote rabbits racetrack radar rafts rage railway raking
rally ramped randomly rapid rarest rash rated ravine rays razor react rebel recipe reduce reef refer regular reheat
reinvest rejoices rekindle relic remedy renting reorder repent request reruns rest return reunion revamp rewind
rhino rhythm ribbon richly ridges rift rigid rims ringing riots ripped rising ritual river roared robot rockets
rodent rogue roles romance roomy roped roster rotate rounded rover rowboat royal ruby rudely ruffled rugged ruined
ruling rumble runway rural rustled ruthless sabotage sack sadness safety saga sailor sake salads sample sanity
sapling sarcasm sash satin saucepan saved sawmill saxophone sayings scamper scenic school science scoop scrub scuba
seasons second sedan seeded segments seismic selfish semifinal sensible september sequence serving session setup
seventh sewage shackles shelter shipped shocking shrugged shuffled shyness siblings sickness sidekick sieve sifting
sighting silk simplest sincerely sipped siren situated sixteen sizes skater skew skirting skulls skydive slackens
sleepless slid slower slug smash smelting smidgen smog smuggled snake sneeze sniff snout snug soapy sober soccer
soda software soggy soil solved somewhere sonic soothe soprano sorry southern sovereign sowed soya space speedy
sphere spiders splendid spout sprig spud spying square stacking stellar stick stockpile strained stunning stylishly
subtly succeed suddenly suede suffice sugar suitcase sulking summon sunken superior surfer sushi suture swagger
swept swiftly sword swung syllabus symptoms syndrome syringe system taboo tacit tadpoles tagged tail taken talent
tamper tanks tapestry tarnished tasked tattoo taunts tavern tawny taxi teardrop technical tedious teeming tell
template tender tepid tequila terminal testing tether textbook thaw theatrics thirsty thorn threaten thumbs thwart
ticket tidy tiers tiger tilt timber tinted tipsy tirade tissue titans toaster tobacco today toenail toffee together
toilet token tolerant tomorrow tonic toolbox topic torch tossed total touchy towel toxic toyed trash trendy tribal
trolling truth trying tsunami tubes tucks tudor tuesday tufts tugs tuition tulips tumbling tunnel turnip tusks tutor
tuxedo twang tweezers twice twofold tycoon typist tyrant ugly ulcers ultimate umbrella umpire unafraid unbending
uncle under uneven unfit ungainly unhappy union unjustly unknown unlikely unmask unnoticed unopened unplugs unquoted
unrest unsafe until unusual unveil unwind unzip upbeat upcoming update upgrade uphill upkeep upload upon upper
upright upstairs uptight upwards urban urchins urgent usage useful usher using usual utensils utility utmost utopia
uttered vacation vague vain value vampire vane vapidly vary vastness vats vaults vector veered vegan vehicle vein
velvet venomous verification vessel veteran vexed vials vibrate victim video viewpoint vigilant viking village
vinegar violin vipers virtual visited vitals vivid vixen vocal vogue voice volcano vortex voted voucher vowels
voyage vulture wade waffle wagtail waist waking wallets wanted warped washing water waveform waxing wayside weavers
website wedge weekday weird welders went wept were western wetsuit whale when whipped whole wickets width wield wife
wiggle wildly winter wipeout wiring wise withdrawn wives wizard wobbly woes woken wolf womanly wonders woozy worry
wounded woven wrap wrist wrong yacht yahoo yanks yard yawning yearbook yellow yesterday yeti yields yodel yoga
younger yoyo zapped zeal zebra zero zesty zigzags zinger zippers zodiac zombie zones zoom`.split(/\s+/),P=e=>e.toLowerCase().match(/[a-z]+/g),F=e=>e.normalize(`NFKD`).toLowerCase().replace(/\p{M}/gu,``),I=e=>F(e).match(/\p{L}+/gu);function L(e,t){let n;return()=>n??=new Map(e.map((e,n)=>[t(e),n]))}var R=[12,15,18,21,24],z={index:L(M,e=>e),words:P,lengths:R,wholeMessage:[...R,16],checksumHolds:W},B={index:L(N,e=>e),words:P,lengths:[25,13],wholeMessage:[25,13],checksumHolds:G(N,3)},V=[z,B];function ge(e,t=[]){V=[z,B,...e.map(e=>({index:L(e,F),words:I,lengths:R,wholeMessage:R,checksumHolds:W})),...t.map(([e,t])=>({index:L(e,F),words:I,lengths:B.lengths,wholeMessage:B.wholeMessage,checksumHolds:G(e,t)}))]}var _e=4096,ve=/\bnsec1[02-9ac-hj-np-z]{58}(?![02-9ac-hj-np-z])/i,ye=/\b[xtyzuvYZUV]prv[1-9A-HJ-NP-Za-km-z]{100,}/,be=/\b[59KLc][1-9A-HJ-NP-Za-km-z]{50,51}\b/g,H=/\b(?:0x)?(?:[0-9a-fA-F]{128}|[0-9a-fA-F]{64})\b/g,xe=/priv(?:ate)?[\s_-]*(?:(?:spend|view)[\s_-]*)?key|(?:spend|view)[\s_-]*key[\s_-]*\(\s*private|secret|seed|mnemonic|nsec|xprv|\bwif\b|recovery|passphrase|password/i,Se=/__cookie__|rpc[\s_-]*pass(?:word)?|\bcookie\b/i,U=48,Ce=/\b0201[0-9a-fA-F]{96,}\b/g,we=/(?<![\w+/-])AgE[\w+/-]{60,}={0,2}/g,Te=/(?<![\w-])[\w-]{43,}={0,2}(?![\w=-])/g,Ee=/^=\d+(?:[&|][ -~]*)?$/,De=/\brunes?\b/i,Oe=/\bcashu([AB])([A-Za-z0-9_\-+/]{20,}={0,2})/g,ke=/(?![\t\n\v\f\r\x85])[\p{Cc}\p{Cf}]|\u034f|[\u115f\u1160\u3164\uffa0]|[\ufe00-\ufe0f]|[\u{e0100}-\u{e01ef}]/gu,Ae=j(v);function je(e){let t=e.replace(ke,``),n=t===e?[e]:[e,t];if(n.some(e=>{let t=new Map;return V.some(n=>(t.has(n.words)||t.set(n.words,n.words(e)),Me(t.get(n.words),n)))}))return{kind:`mnemonic`};if(n.some(e=>ve.test(e)))return{kind:`nsec`};if(n.some(e=>ye.test(e)||Ie(e)))return{kind:`bitcoin-key`};if(n.some(Re))return{kind:`node-login`};if(n.some(Le))return{kind:`hex-key`};let r=n.map(Ve);return r.find(e=>e?.kind===`cashu`&&e.amount!==null)??r.find(e=>e)??null}function Me(e,t){let n=Math.min(...t.lengths);if(!e||e.length<n)return!1;let r=t.index(),i=_e,a=[],o=(e,n)=>{let r=a.slice(e,e+n),i=new Map;for(let e of r)i.set(e,(i.get(e)??0)+1);if(i.size===1)return!1;let[o,s]=[...i].reduce((e,t)=>t[1]>e[1]?t:e);return s>n/2&&(a[e-1]===o||a[e+n]===o)?!1:t.checksumHolds(r)},s=()=>{if(a.length>=n){for(let e of t.lengths)for(let t=0;t+e<=a.length&&i>0;t++,i--)if(o(t,e))return!0;if(a.length===e.length&&t.wholeMessage.includes(a.length)&&new Set(a).size>1)return!0}return a=[],!1};for(let t of e){let e=r.get(t);if(e!==void 0)a.push(e);else if(s())return!0}return s()}function W(e){let t=e.length*11,n=t/33,r=(t-n)/8,i=new Uint8Array(Math.ceil(t/8));return e.forEach((e,t)=>{for(let n=0;n<11;n++)if(e&1<<10-n){let e=t*11+n;i[e>>3]|=128>>(e&7)}}),v(i.subarray(0,r))[0]>>8-n==i[r]>>8-n}function G(e,t){let n;return r=>{n??=e.map(e=>Array.from(e).slice(0,t).join(``));let i=r.slice(0,-1);return i[Fe(i.map(e=>n[e]).join(``))%i.length]===r[r.length-1]}}var Ne=Uint32Array.from({length:256},(e,t)=>{let n=t;for(let e=0;e<8;e++)n=n&1?3988292384^n>>>1:n>>>1;return n}),Pe=new TextEncoder;function Fe(e){let t=4294967295;for(let n of Pe.encode(e))t=Ne[(t^n)&255]^t>>>8;return(t^4294967295)>>>0}function Ie(e){for(let[t]of e.matchAll(be))try{let e=Ae.decode(t);if((e[0]===128||e[0]===239)&&(e.length===33||e.length===34&&e[33]===1))return!0}catch{}return!1}function K(e,t,n){let r=e.slice(Math.max(0,t.index-U),t.index),i=e.slice(t.index+t[0].length,t.index+t[0].length+U);return n.test(r)||n.test(i)}function Le(e){return q(e,xe)}function q(e,t){for(let n of e.matchAll(H))if(K(e,n,t))return!0;return!1}function Re(e){if(q(e,Se))return!0;for(let[t]of e.matchAll(Ce))if(t.length%2==0&&Z(Uint8Array.from(t.match(/../g),e=>parseInt(e,16))))return!0;for(let[t]of e.matchAll(we))if(Z(X(t)))return!0;for(let t of e.matchAll(Te))if(Be(e,t))return!0;return!1}var J=e=>e.every(e=>e>=32&&e<=126),Y=e=>Array.from(e,e=>String.fromCharCode(e)).join(``);function X(e){try{return $(e)}catch{return null}}function ze(e,t){return btoa(Y(t)).replace(/\+/g,`-`).replace(/\//g,`_`)===e}function Z(e){if(!e||e[0]!==2||e[1]!==1)return!1;let t=e[2];return t>0&&t<128&&J(e.subarray(3,3+t))&&e[3+t]===2&&e.length>=3+t+36&&e[e.length-34]===6&&e[e.length-33]===32}function Be(e,t){if(/^[0-9a-fA-F]+=*$/.test(t[0]))return!1;let n=X(t[0]);if(!n||n.length<32||J(n.subarray(0,32)))return!1;let r=n.subarray(32);if(!J(r))return!1;let i=Y(r);return ze(t[0],n)&&Ee.test(i)?!0:(!i||/^\w*[!=/^$~<>{}#]/.test(i))&&K(e,t,De)}function Ve(e){let t=[...e.matchAll(Oe)].map(([,e,t])=>He(e,t));if(!t.length)return null;let n=t.find(e=>e)?.unit??`sat`;return{kind:`cashu`,amount:t.every(e=>e&&e.unit===n)?t.reduce((e,t)=>e+t.amount,0):null,unit:n}}function He(e,t){try{let n=$(t);if(e===`A`){let e=JSON.parse(new TextDecoder(`utf-8`,{fatal:!0}).decode(n));return Q(e.token?.flatMap(e=>e.proofs??[]).map(e=>e.amount),e.unit)}let r=Ue(n);return Q(r?.t?.flatMap(e=>e.p??[]).map(e=>e.a),r?.u)}catch{return null}}function Q(e,t){if(!e?.length||!e.every(e=>Number.isSafeInteger(e)&&e>=0))return null;let n=e.reduce((e,t)=>e+t,0);return Number.isSafeInteger(n)?{amount:n,unit:typeof t==`string`&&t?t:`sat`}:null}function $(e){let t=e.replace(/-/g,`+`).replace(/_/g,`/`).replace(/=+$/,``),n=atob(t+`=`.repeat((4-t.length%4)%4));return Uint8Array.from(n,e=>e.charCodeAt(0))}function Ue(e){let t=0,n=0,r=new DataView(e.buffer,e.byteOffset,e.byteLength),i=n=>{if(n<24)return n;let r=n===24?1:n===25?2:n===26?4:n===27?8:0;if(!r||t+r>e.length)throw Error(`cbor`);let i=0;for(let n=0;n<r;n++)i=i*256+e[t+n];return t+=r,i},a=()=>{if(t>=e.length||++n>32)throw Error(`cbor`);let o=e[t++],s=o>>5,c=o&31;try{if(s===7){if(c===20)return!1;if(c===21)return!0;if(c===22||c===23)return null;if(c===25)return t+=2,NaN;if(c===26)return t+=4,r.getFloat32(t-4);if(c===27)return t+=8,r.getFloat64(t-8);throw Error(`cbor`)}let n=i(c);switch(s){case 0:return n;case 1:return-1-n;case 2:case 3:{if(t+n>e.length)throw Error(`cbor`);let r=e.subarray(t,t+=n);return s===2?r:new TextDecoder(`utf-8`,{fatal:!0}).decode(r)}case 4:if(n>e.length-t)throw Error(`cbor`);return Array.from({length:n},a);case 5:{if(n>e.length-t)throw Error(`cbor`);let r=Object.create(null);for(let e=0;e<n;e++){let e=a();r[String(e)]=a()}return r}default:return a()}}finally{n--}};return a()}var We=Object.freeze(`abacate
abaixo
abalar
abater
abduzir
abelha
aberto
abismo
abotoar
abranger
abreviar
abrigar
abrupto
absinto
absoluto
absurdo
abutre
acabado
acalmar
acampar
acanhar
acaso
aceitar
acelerar
acenar
acervo
acessar
acetona
achatar
acidez
acima
acionado
acirrar
aclamar
aclive
acolhida
acomodar
acoplar
acordar
acumular
acusador
adaptar
adega
adentro
adepto
adequar
aderente
adesivo
adeus
adiante
aditivo
adjetivo
adjunto
admirar
adorar
adquirir
adubo
adverso
advogado
aeronave
afastar
aferir
afetivo
afinador
afivelar
aflito
afluente
afrontar
agachar
agarrar
agasalho
agenciar
agilizar
agiota
agitado
agora
agradar
agreste
agrupar
aguardar
agulha
ajoelhar
ajudar
ajustar
alameda
alarme
alastrar
alavanca
albergue
albino
alcatra
aldeia
alecrim
alegria
alertar
alface
alfinete
algum
alheio
aliar
alicate
alienar
alinhar
aliviar
almofada
alocar
alpiste
alterar
altitude
alucinar
alugar
aluno
alusivo
alvo
amaciar
amador
amarelo
amassar
ambas
ambiente
ameixa
amenizar
amido
amistoso
amizade
amolador
amontoar
amoroso
amostra
amparar
ampliar
ampola
anagrama
analisar
anarquia
anatomia
andaime
anel
anexo
angular
animar
anjo
anomalia
anotado
ansioso
anterior
anuidade
anunciar
anzol
apagador
apalpar
apanhado
apego
apelido
apertada
apesar
apetite
apito
aplauso
aplicada
apoio
apontar
aposta
aprendiz
aprovar
aquecer
arame
aranha
arara
arcada
ardente
areia
arejar
arenito
aresta
argiloso
argola
arma
arquivo
arraial
arrebate
arriscar
arroba
arrumar
arsenal
arterial
artigo
arvoredo
asfaltar
asilado
aspirar
assador
assinar
assoalho
assunto
astral
atacado
atadura
atalho
atarefar
atear
atender
aterro
ateu
atingir
atirador
ativo
atoleiro
atracar
atrevido
atriz
atual
atum
auditor
aumentar
aura
aurora
autismo
autoria
autuar
avaliar
avante
avaria
avental
avesso
aviador
avisar
avulso
axila
azarar
azedo
azeite
azulejo
babar
babosa
bacalhau
bacharel
bacia
bagagem
baiano
bailar
baioneta
bairro
baixista
bajular
baleia
baliza
balsa
banal
bandeira
banho
banir
banquete
barato
barbado
baronesa
barraca
barulho
baseado
bastante
batata
batedor
batida
batom
batucar
baunilha
beber
beijo
beirada
beisebol
beldade
beleza
belga
beliscar
bendito
bengala
benzer
berimbau
berlinda
berro
besouro
bexiga
bezerro
bico
bicudo
bienal
bifocal
bifurcar
bigorna
bilhete
bimestre
bimotor
biologia
biombo
biosfera
bipolar
birrento
biscoito
bisneto
bispo
bissexto
bitola
bizarro
blindado
bloco
bloquear
boato
bobagem
bocado
bocejo
bochecha
boicotar
bolada
boletim
bolha
bolo
bombeiro
bonde
boneco
bonita
borbulha
borda
boreal
borracha
bovino
boxeador
branco
brasa
braveza
breu
briga
brilho
brincar
broa
brochura
bronzear
broto
bruxo
bucha
budismo
bufar
bule
buraco
busca
busto
buzina
cabana
cabelo
cabide
cabo
cabrito
cacau
cacetada
cachorro
cacique
cadastro
cadeado
cafezal
caiaque
caipira
caixote
cajado
caju
calafrio
calcular
caldeira
calibrar
calmante
calota
camada
cambista
camisa
camomila
campanha
camuflar
canavial
cancelar
caneta
canguru
canhoto
canivete
canoa
cansado
cantar
canudo
capacho
capela
capinar
capotar
capricho
captador
capuz
caracol
carbono
cardeal
careca
carimbar
carneiro
carpete
carreira
cartaz
carvalho
casaco
casca
casebre
castelo
casulo
catarata
cativar
caule
causador
cautelar
cavalo
caverna
cebola
cedilha
cegonha
celebrar
celular
cenoura
censo
centeio
cercar
cerrado
certeiro
cerveja
cetim
cevada
chacota
chaleira
chamado
chapada
charme
chatice
chave
chefe
chegada
cheiro
cheque
chicote
chifre
chinelo
chocalho
chover
chumbo
chutar
chuva
cicatriz
ciclone
cidade
cidreira
ciente
cigana
cimento
cinto
cinza
ciranda
circuito
cirurgia
citar
clareza
clero
clicar
clone
clube
coado
coagir
cobaia
cobertor
cobrar
cocada
coelho
coentro
coeso
cogumelo
coibir
coifa
coiote
colar
coleira
colher
colidir
colmeia
colono
coluna
comando
combinar
comentar
comitiva
comover
complexo
comum
concha
condor
conectar
confuso
congelar
conhecer
conjugar
consumir
contrato
convite
cooperar
copeiro
copiador
copo
coquetel
coragem
cordial
corneta
coronha
corporal
correio
cortejo
coruja
corvo
cosseno
costela
cotonete
couro
couve
covil
cozinha
cratera
cravo
creche
credor
creme
crer
crespo
criada
criminal
crioulo
crise
criticar
crosta
crua
cruzeiro
cubano
cueca
cuidado
cujo
culatra
culminar
culpar
cultura
cumprir
cunhado
cupido
curativo
curral
cursar
curto
cuspir
custear
cutelo
damasco
datar
debater
debitar
deboche
debulhar
decalque
decimal
declive
decote
decretar
dedal
dedicado
deduzir
defesa
defumar
degelo
degrau
degustar
deitado
deixar
delator
delegado
delinear
delonga
demanda
demitir
demolido
dentista
depenado
depilar
depois
depressa
depurar
deriva
derramar
desafio
desbotar
descanso
desenho
desfiado
desgaste
desigual
deslize
desmamar
desova
despesa
destaque
desviar
detalhar
detentor
detonar
detrito
deusa
dever
devido
devotado
dezena
diagrama
dialeto
didata
difuso
digitar
dilatado
diluente
diminuir
dinastia
dinheiro
diocese
direto
discreta
disfarce
disparo
disquete
dissipar
distante
ditador
diurno
diverso
divisor
divulgar
dizer
dobrador
dolorido
domador
dominado
donativo
donzela
dormente
dorsal
dosagem
dourado
doutor
drenagem
drible
drogaria
duelar
duende
dueto
duplo
duquesa
durante
duvidoso
eclodir
ecoar
ecologia
edificar
edital
educado
efeito
efetivar
ejetar
elaborar
eleger
eleitor
elenco
elevador
eliminar
elogiar
embargo
embolado
embrulho
embutido
emenda
emergir
emissor
empatia
empenho
empinado
empolgar
emprego
empurrar
emulador
encaixe
encenado
enchente
encontro
endeusar
endossar
enfaixar
enfeite
enfim
engajado
engenho
englobar
engomado
engraxar
enguia
enjoar
enlatar
enquanto
enraizar
enrolado
enrugar
ensaio
enseada
ensino
ensopado
entanto
enteado
entidade
entortar
entrada
entulho
envergar
enviado
envolver
enxame
enxerto
enxofre
enxuto
epiderme
equipar
ereto
erguido
errata
erva
ervilha
esbanjar
esbelto
escama
escola
escrita
escuta
esfinge
esfolar
esfregar
esfumado
esgrima
esmalte
espanto
espelho
espiga
esponja
espreita
espumar
esquerda
estaca
esteira
esticar
estofado
estrela
estudo
esvaziar
etanol
etiqueta
euforia
europeu
evacuar
evaporar
evasivo
eventual
evidente
evoluir
exagero
exalar
examinar
exato
exausto
excesso
excitar
exclamar
executar
exemplo
exibir
exigente
exonerar
expandir
expelir
expirar
explanar
exposto
expresso
expulsar
externo
extinto
extrato
fabricar
fabuloso
faceta
facial
fada
fadiga
faixa
falar
falta
familiar
fandango
fanfarra
fantoche
fardado
farelo
farinha
farofa
farpa
fartura
fatia
fator
favorita
faxina
fazenda
fechado
feijoada
feirante
felino
feminino
fenda
feno
fera
feriado
ferrugem
ferver
festejar
fetal
feudal
fiapo
fibrose
ficar
ficheiro
figurado
fileira
filho
filme
filtrar
firmeza
fisgada
fissura
fita
fivela
fixador
fixo
flacidez
flamingo
flanela
flechada
flora
flutuar
fluxo
focal
focinho
fofocar
fogo
foguete
foice
folgado
folheto
forjar
formiga
forno
forte
fosco
fossa
fragata
fralda
frango
frasco
fraterno
freira
frente
fretar
frieza
friso
fritura
fronha
frustrar
fruteira
fugir
fulano
fuligem
fundar
fungo
funil
furador
furioso
futebol
gabarito
gabinete
gado
gaiato
gaiola
gaivota
galega
galho
galinha
galocha
ganhar
garagem
garfo
gargalo
garimpo
garoupa
garrafa
gasoduto
gasto
gata
gatilho
gaveta
gazela
gelado
geleia
gelo
gemada
gemer
gemido
generoso
gengiva
genial
genoma
genro
geologia
gerador
germinar
gesso
gestor
ginasta
gincana
gingado
girafa
girino
glacial
glicose
global
glorioso
goela
goiaba
golfe
golpear
gordura
gorjeta
gorro
gostoso
goteira
governar
gracejo
gradual
grafite
gralha
grampo
granada
gratuito
graveto
graxa
grego
grelhar
greve
grilo
grisalho
gritaria
grosso
grotesco
grudado
grunhido
gruta
guache
guarani
guaxinim
guerrear
guiar
guincho
guisado
gula
guloso
guru
habitar
harmonia
haste
haver
hectare
herdar
heresia
hesitar
hiato
hibernar
hidratar
hiena
hino
hipismo
hipnose
hipoteca
hoje
holofote
homem
honesto
honrado
hormonal
hospedar
humorado
iate
ideia
idoso
ignorado
igreja
iguana
ileso
ilha
iludido
iluminar
ilustrar
imagem
imediato
imenso
imersivo
iminente
imitador
imortal
impacto
impedir
implante
impor
imprensa
impune
imunizar
inalador
inapto
inativo
incenso
inchar
incidir
incluir
incolor
indeciso
indireto
indutor
ineficaz
inerente
infantil
infestar
infinito
inflamar
informal
infrator
ingerir
inibido
inicial
inimigo
injetar
inocente
inodoro
inovador
inox
inquieto
inscrito
inseto
insistir
inspetor
instalar
insulto
intacto
integral
intimar
intocado
intriga
invasor
inverno
invicto
invocar
iogurte
iraniano
ironizar
irreal
irritado
isca
isento
isolado
isqueiro
italiano
janeiro
jangada
janta
jararaca
jardim
jarro
jasmim
jato
javali
jazida
jejum
joaninha
joelhada
jogador
joia
jornal
jorrar
jovem
juba
judeu
judoca
juiz
julgador
julho
jurado
jurista
juro
justa
labareda
laboral
lacre
lactante
ladrilho
lagarta
lagoa
laje
lamber
lamentar
laminar
lampejo
lanche
lapidar
lapso
laranja
lareira
largura
lasanha
lastro
lateral
latido
lavanda
lavoura
lavrador
laxante
lazer
lealdade
lebre
legado
legendar
legista
leigo
leiloar
leitura
lembrete
leme
lenhador
lentilha
leoa
lesma
leste
letivo
letreiro
levar
leveza
levitar
liberal
libido
liderar
ligar
ligeiro
limitar
limoeiro
limpador
linda
linear
linhagem
liquidez
listagem
lisura
litoral
livro
lixa
lixeira
locador
locutor
lojista
lombo
lona
longe
lontra
lorde
lotado
loteria
loucura
lousa
louvar
luar
lucidez
lucro
luneta
lustre
lutador
luva
macaco
macete
machado
macio
madeira
madrinha
magnata
magreza
maior
mais
malandro
malha
malote
maluco
mamilo
mamoeiro
mamute
manada
mancha
mandato
manequim
manhoso
manivela
manobrar
mansa
manter
manusear
mapeado
maquinar
marcador
maresia
marfim
margem
marinho
marmita
maroto
marquise
marreco
martelo
marujo
mascote
masmorra
massagem
mastigar
matagal
materno
matinal
matutar
maxilar
medalha
medida
medusa
megafone
meiga
melancia
melhor
membro
memorial
menino
menos
mensagem
mental
merecer
mergulho
mesada
mesclar
mesmo
mesquita
mestre
metade
meteoro
metragem
mexer
mexicano
micro
migalha
migrar
milagre
milenar
milhar
mimado
minerar
minhoca
ministro
minoria
miolo
mirante
mirtilo
misturar
mocidade
moderno
modular
moeda
moer
moinho
moita
moldura
moleza
molho
molinete
molusco
montanha
moqueca
morango
morcego
mordomo
morena
mosaico
mosquete
mostarda
motel
motim
moto
motriz
muda
muito
mulata
mulher
multar
mundial
munido
muralha
murcho
muscular
museu
musical
nacional
nadador
naja
namoro
narina
narrado
nascer
nativa
natureza
navalha
navegar
navio
neblina
nebuloso
negativa
negociar
negrito
nervoso
neta
neural
nevasca
nevoeiro
ninar
ninho
nitidez
nivelar
nobreza
noite
noiva
nomear
nominal
nordeste
nortear
notar
noticiar
noturno
novelo
novilho
novo
nublado
nudez
numeral
nupcial
nutrir
nuvem
obcecado
obedecer
objetivo
obrigado
obscuro
obstetra
obter
obturar
ocidente
ocioso
ocorrer
oculista
ocupado
ofegante
ofensiva
oferenda
oficina
ofuscado
ogiva
olaria
oleoso
olhar
oliveira
ombro
omelete
omisso
omitir
ondulado
oneroso
ontem
opcional
operador
oponente
oportuno
oposto
orar
orbitar
ordem
ordinal
orfanato
orgasmo
orgulho
oriental
origem
oriundo
orla
ortodoxo
orvalho
oscilar
ossada
osso
ostentar
otimismo
ousadia
outono
outubro
ouvido
ovelha
ovular
oxidar
oxigenar
pacato
paciente
pacote
pactuar
padaria
padrinho
pagar
pagode
painel
pairar
paisagem
palavra
palestra
palheta
palito
palmada
palpitar
pancada
panela
panfleto
panqueca
pantanal
papagaio
papelada
papiro
parafina
parcial
pardal
parede
partida
pasmo
passado
pastel
patamar
patente
patinar
patrono
paulada
pausar
peculiar
pedalar
pedestre
pediatra
pedra
pegada
peitoral
peixe
pele
pelicano
penca
pendurar
peneira
penhasco
pensador
pente
perceber
perfeito
pergunta
perito
permitir
perna
perplexo
persiana
pertence
peruca
pescado
pesquisa
pessoa
petiscar
piada
picado
piedade
pigmento
pilastra
pilhado
pilotar
pimenta
pincel
pinguim
pinha
pinote
pintar
pioneiro
pipoca
piquete
piranha
pires
pirueta
piscar
pistola
pitanga
pivete
planta
plaqueta
platina
plebeu
plumagem
pluvial
pneu
poda
poeira
poetisa
polegada
policiar
poluente
polvilho
pomar
pomba
ponderar
pontaria
populoso
porta
possuir
postal
pote
poupar
pouso
povoar
praia
prancha
prato
praxe
prece
predador
prefeito
premiar
prensar
preparar
presilha
pretexto
prevenir
prezar
primata
princesa
prisma
privado
processo
produto
profeta
proibido
projeto
prometer
propagar
prosa
protetor
provador
publicar
pudim
pular
pulmonar
pulseira
punhal
punir
pupilo
pureza
puxador
quadra
quantia
quarto
quase
quebrar
queda
queijo
quente
querido
quimono
quina
quiosque
rabanada
rabisco
rachar
racionar
radial
raiar
rainha
raio
raiva
rajada
ralado
ramal
ranger
ranhura
rapadura
rapel
rapidez
raposa
raquete
raridade
rasante
rascunho
rasgar
raspador
rasteira
rasurar
ratazana
ratoeira
realeza
reanimar
reaver
rebaixar
rebelde
rebolar
recado
recente
recheio
recibo
recordar
recrutar
recuar
rede
redimir
redonda
reduzida
reenvio
refinar
refletir
refogar
refresco
refugiar
regalia
regime
regra
reinado
reitor
rejeitar
relativo
remador
remendo
remorso
renovado
reparo
repelir
repleto
repolho
represa
repudiar
requerer
resenha
resfriar
resgatar
residir
resolver
respeito
ressaca
restante
resumir
retalho
reter
retirar
retomada
retratar
revelar
revisor
revolta
riacho
rica
rigidez
rigoroso
rimar
ringue
risada
risco
risonho
robalo
rochedo
rodada
rodeio
rodovia
roedor
roleta
romano
roncar
rosado
roseira
rosto
rota
roteiro
rotina
rotular
rouco
roupa
roxo
rubro
rugido
rugoso
ruivo
rumo
rupestre
russo
sabor
saciar
sacola
sacudir
sadio
safira
saga
sagrada
saibro
salada
saleiro
salgado
saliva
salpicar
salsicha
saltar
salvador
sambar
samurai
sanar
sanfona
sangue
sanidade
sapato
sarda
sargento
sarjeta
saturar
saudade
saxofone
sazonal
secar
secular
seda
sedento
sediado
sedoso
sedutor
segmento
segredo
segundo
seiva
seleto
selvagem
semanal
semente
senador
senhor
sensual
sentado
separado
sereia
seringa
serra
servo
setembro
setor
sigilo
silhueta
silicone
simetria
simpatia
simular
sinal
sincero
singular
sinopse
sintonia
sirene
siri
situado
soberano
sobra
socorro
sogro
soja
solda
soletrar
solteiro
sombrio
sonata
sondar
sonegar
sonhador
sono
soprano
soquete
sorrir
sorteio
sossego
sotaque
soterrar
sovado
sozinho
suavizar
subida
submerso
subsolo
subtrair
sucata
sucesso
suco
sudeste
sufixo
sugador
sugerir
sujeito
sulfato
sumir
suor
superior
suplicar
suposto
suprimir
surdina
surfista
surpresa
surreal
surtir
suspiro
sustento
tabela
tablete
tabuada
tacho
tagarela
talher
talo
talvez
tamanho
tamborim
tampa
tangente
tanto
tapar
tapioca
tardio
tarefa
tarja
tarraxa
tatuagem
taurino
taxativo
taxista
teatral
tecer
tecido
teclado
tedioso
teia
teimar
telefone
telhado
tempero
tenente
tensor
tentar
termal
terno
terreno
tese
tesoura
testado
teto
textura
texugo
tiara
tigela
tijolo
timbrar
timidez
tingido
tinteiro
tiragem
titular
toalha
tocha
tolerar
tolice
tomada
tomilho
tonel
tontura
topete
tora
torcido
torneio
torque
torrada
torto
tostar
touca
toupeira
toxina
trabalho
tracejar
tradutor
trafegar
trajeto
trama
trancar
trapo
traseiro
tratador
travar
treino
tremer
trepidar
trevo
triagem
tribo
triciclo
tridente
trilogia
trindade
triplo
triturar
triunfal
trocar
trombeta
trova
trunfo
truque
tubular
tucano
tudo
tulipa
tupi
turbo
turma
turquesa
tutelar
tutorial
uivar
umbigo
unha
unidade
uniforme
urologia
urso
urtiga
urubu
usado
usina
usufruir
vacina
vadiar
vagaroso
vaidoso
vala
valente
validade
valores
vantagem
vaqueiro
varanda
vareta
varrer
vascular
vasilha
vassoura
vazar
vazio
veado
vedar
vegetar
veicular
veleiro
velhice
veludo
vencedor
vendaval
venerar
ventre
verbal
verdade
vereador
vergonha
vermelho
verniz
versar
vertente
vespa
vestido
vetorial
viaduto
viagem
viajar
viatura
vibrador
videira
vidraria
viela
viga
vigente
vigiar
vigorar
vilarejo
vinco
vinheta
vinil
violeta
virada
virtude
visitar
visto
vitral
viveiro
vizinho
voador
voar
vogal
volante
voleibol
voltagem
volumoso
vontade
vulto
vuvuzela
xadrez
xarope
xeque
xeretar
xerife
xingar
zangado
zarpar
zebu
zelador
zombar
zoologia
zumbido`.split(`
`));`ábaco abdomen abeja abierto abogado abono aborto abrazo abrir abuelo abuso acabar academia acceso acción aceite acelga
acento aceptar ácido aclarar acné acoger acoso activo acto actriz actuar acudir acuerdo acusar adicto admitir adoptar
adorno aduana adulto aéreo afectar afición afinar afirmar ágil agitar agonía agosto agotar agregar agrio agua agudo
águila aguja ahogo ahorro aire aislar ajedrez ajeno ajuste alacrán alambre alarma alba álbum alcalde aldea alegre
alejar alerta aleta alfiler alga algodón aliado aliento alivio alma almeja almíbar altar alteza altivo alto altura
alumno alzar amable amante amapola amargo amasar ámbar ámbito ameno amigo amistad amor amparo amplio ancho anciano
ancla andar andén anemia ángulo anillo ánimo anís anotar antena antiguo antojo anual anular anuncio añadir añejo año
apagar aparato apetito apio aplicar apodo aporte apoyo aprender aprobar apuesta apuro arado araña arar árbitro árbol
arbusto archivo arco arder ardilla arduo área árido aries armonía arnés aroma arpa arpón arreglo arroz arruga arte
artista asa asado asalto ascenso asegurar aseo asesor asiento asilo asistir asno asombro áspero astilla astro astuto
asumir asunto atajo ataque atar atento ateo ático atleta átomo atraer atroz atún audaz audio auge aula aumento ausente
autor aval avance avaro ave avellana avena avestruz avión aviso ayer ayuda ayuno azafrán azar azote azúcar azufre azul
baba babor bache bahía baile bajar balanza balcón balde bambú banco banda baño barba barco barniz barro báscula bastón
basura batalla batería batir batuta baúl bazar bebé bebida bello besar beso bestia bicho bien bingo blanco bloque
blusa boa bobina bobo boca bocina boda bodega boina bola bolero bolsa bomba bondad bonito bono bonsái borde borrar
bosque bote botín bóveda bozal bravo brazo brecha breve brillo brinco brisa broca broma bronce brote bruja brusco
bruto buceo bucle bueno buey bufanda bufón búho buitre bulto burbuja burla burro buscar butaca buzón caballo cabeza
cabina cabra cacao cadáver cadena caer café caída caimán caja cajón cal calamar calcio caldo calidad calle calma calor
calvo cama cambio camello camino campo cáncer candil canela canguro canica canto caña cañón caoba caos capaz capitán
capote captar capucha cara carbón cárcel careta carga cariño carne carpeta carro carta casa casco casero caspa castor
catorce catre caudal causa cazo cebolla ceder cedro celda célebre celoso célula cemento ceniza centro cerca cerdo
cereza cero cerrar certeza césped cetro chacal chaleco champú chancla chapa charla chico chiste chivo choque choza
chuleta chupar ciclón ciego cielo cien cierto cifra cigarro cima cinco cine cinta ciprés circo ciruela cisne cita
ciudad clamor clan claro clase clave cliente clima clínica cobre cocción cochino cocina coco código codo cofre coger
cohete cojín cojo cola colcha colegio colgar colina collar colmo columna combate comer comida cómodo compra conde
conejo conga conocer consejo contar copa copia corazón corbata corcho cordón corona correr coser cosmos costa cráneo
cráter crear crecer creído crema cría crimen cripta crisis cromo crónica croqueta crudo cruz cuadro cuarto cuatro cubo
cubrir cuchara cuello cuento cuerda cuesta cueva cuidar culebra culpa culto cumbre cumplir cuna cuneta cuota cupón
cúpula curar curioso curso curva cutis dama danza dar dardo dátil deber débil década decir dedo defensa definir dejar
delfín delgado delito demora denso dental deporte derecho derrota desayuno deseo desfile desnudo destino desvío
detalle detener deuda día diablo diadema diamante diana diario dibujo dictar diente dieta diez difícil digno dilema
diluir dinero directo dirigir disco diseño disfraz diva divino doble doce dolor domingo don donar dorado dormir dorso
dos dosis dragón droga ducha duda duelo dueño dulce dúo duque durar dureza duro ébano ebrio echar eco ecuador edad
edición edificio editor educar efecto eficaz eje ejemplo elefante elegir elemento elevar elipse élite elixir elogio
eludir embudo emitir emoción empate empeño empleo empresa enano encargo enchufe encía enemigo enero enfado enfermo
engaño enigma enlace enorme enredo ensayo enseñar entero entrar envase envío época equipo erizo escala escena escolar
escribir escudo esencia esfera esfuerzo espada espejo espía esposa espuma esquí estar este estilo estufa etapa eterno
ética etnia evadir evaluar evento evitar exacto examen exceso excusa exento exigir exilio existir éxito experto
explicar exponer extremo fábrica fábula fachada fácil factor faena faja falda fallo falso faltar fama familia famoso
faraón farmacia farol farsa fase fatiga fauna favor fax febrero fecha feliz feo feria feroz fértil fervor festín
fiable fianza fiar fibra ficción ficha fideo fiebre fiel fiera fiesta figura fijar fijo fila filete filial filtro fin
finca fingir finito firma flaco flauta flecha flor flota fluir flujo flúor fobia foca fogata fogón folio folleto fondo
forma forro fortuna forzar fosa foto fracaso frágil franja frase fraude freír freno fresa frío frito fruta fuego
fuente fuerza fuga fumar función funda furgón furia fusil fútbol futuro gacela gafas gaita gajo gala galería gallo
gamba ganar gancho ganga ganso garaje garza gasolina gastar gato gavilán gemelo gemir gen género genio gente geranio
gerente germen gesto gigante gimnasio girar giro glaciar globo gloria gol golfo goloso golpe goma gordo gorila gorra
gota goteo gozar grada gráfico grano grasa gratis grave grieta grillo gripe gris grito grosor grúa grueso grumo grupo
guante guapo guardia guerra guía guiño guion guiso guitarra gusano gustar haber hábil hablar hacer hacha hada hallar
hamaca harina haz hazaña hebilla hebra hecho helado helio hembra herir hermano héroe hervir hielo hierro hígado
higiene hijo himno historia hocico hogar hoguera hoja hombre hongo honor honra hora hormiga horno hostil hoyo hueco
huelga huerta hueso huevo huida huir humano húmedo humilde humo hundir huracán hurto icono ideal idioma ídolo iglesia
iglú igual ilegal ilusión imagen imán imitar impar imperio imponer impulso incapaz índice inerte infiel informe
ingenio inicio inmenso inmune innato insecto instante interés íntimo intuir inútil invierno ira iris ironía isla
islote jabalí jabón jamón jarabe jardín jarra jaula jazmín jefe jeringa jinete jornada joroba joven joya juerga jueves
juez jugador jugo juguete juicio junco jungla junio juntar júpiter jurar justo juvenil juzgar kilo koala labio lacio
lacra lado ladrón lagarto lágrima laguna laico lamer lámina lámpara lana lancha langosta lanza lápiz largo larva
lástima lata látex latir laurel lavar lazo leal lección leche lector leer legión legumbre lejano lengua lento leña
león leopardo lesión letal letra leve leyenda libertad libro licor líder lidiar lienzo liga ligero lima límite limón
limpio lince lindo línea lingote lino linterna líquido liso lista litera litio litro llaga llama llanto llave llegar
llenar llevar llorar llover lluvia lobo loción loco locura lógica logro lombriz lomo lonja lote lucha lucir lugar lujo
luna lunes lupa lustro luto luz maceta macho madera madre maduro maestro mafia magia mago maíz maldad maleta malla
malo mamá mambo mamut manco mando manejar manga maniquí manjar mano manso manta mañana mapa máquina mar marco marea
marfil margen marido mármol marrón martes marzo masa máscara masivo matar materia matiz matriz máximo mayor mazorca
mecha medalla medio médula mejilla mejor melena melón memoria menor mensaje mente menú mercado merengue mérito mes
mesón meta meter método metro mezcla miedo miel miembro miga mil milagro militar millón mimo mina minero mínimo minuto
miope mirar misa miseria misil mismo mitad mito mochila moción moda modelo moho mojar molde moler molino momento momia
monarca moneda monja monto moño morada morder moreno morir morro morsa mortal mosca mostrar motivo mover móvil mozo
mucho mudar mueble muela muerte muestra mugre mujer mula muleta multa mundo muñeca mural muro músculo museo musgo
música muslo nácar nación nadar naipe naranja nariz narrar nasal natal nativo natural náusea naval nave navidad necio
néctar negar negocio negro neón nervio neto neutro nevar nevera nicho nido niebla nieto niñez niño nítido nivel
nobleza noche nómina noria norma norte nota noticia novato novela novio nube nuca núcleo nudillo nudo nuera nueve nuez
nulo número nutria oasis obeso obispo objeto obra obrero observar obtener obvio oca ocaso océano ochenta ocho ocio
ocre octavo octubre oculto ocupar ocurrir odiar odio odisea oeste ofensa oferta oficio ofrecer ogro oído oír ojo ola
oleada olfato olivo olla olmo olor olvido ombligo onda onza opaco opción ópera opinar oponer optar óptica opuesto
oración orador oral órbita orca orden oreja órgano orgía orgullo oriente origen orilla oro orquesta oruga osadía
oscuro osezno oso ostra otoño otro oveja óvulo óxido oxígeno oyente ozono pacto padre paella página pago país pájaro
palabra palco paleta pálido palma paloma palpar pan panal pánico pantera pañuelo papá papel papilla paquete parar
parcela pared parir paro párpado parque párrafo parte pasar paseo pasión paso pasta pata patio patria pausa pauta pavo
payaso peatón pecado pecera pecho pedal pedir pegar peine pelar peldaño pelea peligro pellejo pelo peluca pena pensar
peñón peón peor pepino pequeño pera percha perder pereza perfil perico perla permiso perro persona pesa pesca pésimo
pestaña pétalo petróleo pez pezuña picar pichón pie piedra pierna pieza pijama pilar piloto pimienta pino pintor pinza
piña piojo pipa pirata pisar piscina piso pista pitón pizca placa plan plata playa plaza pleito pleno plomo pluma
plural pobre poco poder podio poema poesía poeta polen policía pollo polvo pomada pomelo pomo pompa poner porción
portal posada poseer posible poste potencia potro pozo prado precoz pregunta premio prensa preso previo primo príncipe
prisión privar proa probar proceso producto proeza profesor programa prole promesa pronto propio próximo prueba
público puchero pudor pueblo puerta puesto pulga pulir pulmón pulpo pulso puma punto puñal puño pupa pupila puré
quedar queja quemar querer queso quieto química quince quitar rábano rabia rabo ración radical raíz rama rampa rancho
rango rapaz rápido rapto rasgo raspa rato rayo raza razón reacción realidad rebaño rebote recaer receta rechazo
recoger recreo recto recurso red redondo reducir reflejo reforma refrán refugio regalo regir regla regreso rehén reino
reír reja relato relevo relieve relleno reloj remar remedio remo rencor rendir renta reparto repetir reposo reptil res
rescate resina respeto resto resumen retiro retorno retrato reunir revés revista rey rezar rico riego rienda riesgo
rifa rígido rigor rincón riñón río riqueza risa ritmo rito`.split(/\s+/);var Ge=`abaular abdominal abeto abissinio abjeto ablucao abnegar abotoar abrutalhar absurdo abutre acautelar accessorios
acetona achocolatado acirrar acne acovardar acrostico actinomicete acustico adaptavel adeus adivinho adjunto admoestar
adnominal adotivo adquirir adriatico adsorcao adutora advogar aerossol afazeres afetuoso afixo afluir afortunar
afrouxar aftosa afunilar agentes agito aglutinar aiatola aimore aino aipo airoso ajeitar ajoelhar ajudante ajuste
alazao albumina alcunha alegria alexandre alforriar alguns alhures alivio almoxarife alotropico alpiste alquimista
alsaciano altura aluviao alvura amazonico ambulatorio ametodico amizades amniotico amovivel amurada anatomico ancorar
anexo anfora aniversario anjo anotar ansioso anturio anuviar anverso anzol aonde apaziguar apito aplicavel apoteotico
aprimorar aprumo apto apuros aquoso arauto arbusto arduo aresta arfar arguto aritmetico arlequim armisticio aromatizar
arpoar arquivo arrumar arsenio arturiano aruaque arvores asbesto ascorbico aspirina asqueroso assustar astuto atazanar
ativo atletismo atmosferico atormentar atroz aturdir audivel auferir augusto aula aumento aurora autuar avatar avexar
avizinhar avolumar avulso axiomatico azerbaijano azimute azoto azulejo bacteriologista badulaque baforada baixote
bajular balzaquiana bambuzal banzo baoba baqueta barulho bastonete batuta bauxita bavaro bazuca bcrepuscular beato
beduino begonia behaviorista beisebol belzebu bemol benzido beocio bequer berro besuntar betume bexiga bezerro biatlon
biboca bicuspide bidirecional bienio bifurcar bigorna bijuteria bimotor binormal bioxido bipolarizacao biquini
birutice bisturi bituca biunivoco bivalve bizarro blasfemo blenorreia blindar bloqueio blusao boazuda bofete bojudo
bolso bombordo bonzo botina boquiaberto bostoniano botulismo bourbon bovino boximane bravura brevidade britar broxar
bruno bruxuleio bubonico bucolico buda budista bueiro buffer bugre bujao bumerangue burundines busto butique buzios
caatinga cabuqui cacunda cafuzo cajueiro camurca canudo caquizeiro carvoeiro casulo catuaba cauterizar cebolinha
cedula ceifeiro celulose cerzir cesto cetro ceus cevar chavena cheroqui chita chovido chuvoso ciatico cibernetico
cicuta cidreira cientistas cifrar cigarro cilio cimo cinzento cioso cipriota cirurgico cisto citrico ciumento civismo
clavicula clero clitoris cluster coaxial cobrir cocota codorniz coexistir cogumelo coito colusao compaixao comutativo
contentamento convulsivo coordenativa coquetel correto corvo costureiro cotovia covil cozinheiro cretino cristo crivo
crotalo cruzes cubo cucuia cueiro cuidar cujo cultural cunilingua cupula curvo custoso cutucar czarismo dablio dacota
dados daguerreotipo daiquiri daltonismo damista dantesco daquilo darwinista dasein dativo deao debutantes decurso
deduzir defunto degustar dejeto deltoide demover denunciar deputado deque dervixe desvirtuar deturpar deuteronomio
devoto dextrose dezoito diatribe dicotomico didatico dietista difuso digressao diluvio diminuto dinheiro dinossauro
dioxido diplomatico dique dirimivel disturbio diurno divulgar dizivel doar dobro docura dodoi doer dogue doloso domo
donzela doping dorsal dossie dote doutro doze dravidico dreno driver dropes druso dubnio ducto dueto dulija dundum
duodeno duquesa durou duvidoso duzia ebano ebrio eburneo echarpe eclusa ecossistema ectoplasma ecumenismo eczema eden
editorial edredom edulcorar efetuar efigie efluvio egiptologo egresso egua einsteiniano eira eivar eixos ejetar
elastomero eldorado elixir elmo eloquente elucidativo emaranhar embutir emerito emfa emitir emotivo empuxo emulsao
enamorar encurvar enduro enevoar enfurnar enguico enho enigmista enlutar enormidade enpreendimento enquanto enriquecer
enrugar entusiastico enunciar envolvimento enxuto enzimatico eolico epiteto epoxi epura equivoco erario erbio ereto
erguido erisipela ermo erotizar erros erupcao ervilha esburacar escutar esfuziante esguio esloveno esmurrar esoterismo
esperanca espirito espurio essencialmente esturricar esvoacar etario eterno etiquetar etnologo etos etrusco euclidiano
euforico eugenico eunuco europio eustaquio eutanasia evasivo eventualidade evitavel evoluir exaustor excursionista
exercito exfoliado exito exotico expurgo exsudar extrusora exumar fabuloso facultativo fado fagulha faixas fajuto
faltoso famoso fanzine fapesp faquir fartura fastio faturista fausto favorito faxineira fazer fealdade febril fecundo
fedorento feerico feixe felicidade felpudo feltro femur fenotipo fervura festivo feto feudo fevereiro fezinha fiasco
fibra ficticio fiduciario fiesp fifa figurino fijiano filtro finura fiorde fiquei firula fissurar fitoteca fivela fixo
flavio flexor flibusteiro flotilha fluxograma fobos foco fofura foguista foie foliculo fominha fonte forum fosso
fotossintese foxtrote fraudulento frevo frivolo frouxo frutose fuba fucsia fugitivo fuinha fujao fulustreco fumo
funileiro furunculo fustigar futurologo fuxico fuzue gabriel gado gaelico gafieira gaguejo gaivota gajo
galvanoplastico gamo ganso garrucha gastronomo gatuno gaussiano gaviao gaxeta gazeteiro gear geiser geminiano generoso
genuino geossinclinal gerundio gestual getulista gibi gigolo gilete ginseng giroscopio glaucio glacial gleba glifo
glote glutonia gnostico goela gogo goitaca golpista gomo gonzo gorro gostou goticula gourmet governo gozo graxo
grevista grito grotesco gruta guaxinim gude gueto guizo guloso gume guru gustativo grelhado gutural habitue haitiano
halterofilista hamburguer hanseniase happening harpista hastear haveres hebreu hectometro hedonista hegira helena
helminto hemorroidas henrique heptassilabo hertziano hesitar heterossexual heuristico hexagono hiato hibrido
hidrostatico hieroglifo hifenizar higienizar hilario himen hino hippie hirsuto historiografia hitlerista hodometro
hoje holograma homus honroso hoquei horto hostilizar hotentote huguenote humilde huno hurra hutu iaia ialorixa iambico
iansa iaque iara iatista iberico ibis icar iceberg icosagono idade ideologo idiotice idoso iemenita iene igarape iglu
ignorar igreja iguaria iidiche ilativo iletrado ilharga ilimitado ilogismo ilustrissimo imaturo imbuzeiro imerso
imitavel imovel imputar imutavel inaveriguavel incutir induzir inextricavel infusao ingua inhame iniquo injusto inning
inoxidavel inquisitorial insustentavel intumescimento inutilizavel invulneravel inzoneiro iodo iogurte ioio ionosfera
ioruba iota ipsilon irascivel iris irlandes irmaos iroques irrupcao isca isento islandes isotopo isqueiro israelita
isso isto iterbio itinerario itrio iuane iugoslavo jabuticabeira jacutinga jade jagunco jainista jaleco jambo
jantarada japones jaqueta jarro jasmim jato jaula javel jazz jegue jeitoso jejum jenipapo jeova jequitiba jersei jesus
jetom jiboia jihad jilo jingle jipe jocoso joelho joguete joio jojoba jorro jota joule joviano jubiloso judoca jugular
juizo jujuba juliano jumento junto jururu justo juta juventude labutar laguna laico lajota lanterninha lapso laquear
lastro lauto lavrar laxativo lazer leasing lebre lecionar ledo leguminoso leitura lele lemure lento leonardo leopardo
lepton leque leste letreiro leucocito levitico lexicologo lhama lhufas liame licoroso lidocaina liliputiano limusine
linotipo lipoproteina liquidos lirismo lisura liturgico livros lixo lobulo locutor lodo logro lojista lombriga lontra
loop loquaz lorota losango lotus louvor luar lubrificavel lucros lugubre luis luminoso luneta lustroso luto luvas
luxuriante luzeiro maduro maestro mafioso magro maiuscula majoritario malvisto mamute manutencao mapoteca maquinista
marzipa masturbar matuto mausoleu mavioso maxixe mazurca meandro mecha medusa mefistofelico megera meirinho melro
memorizar menu mequetrefe mertiolate mestria metroviario mexilhao mezanino miau microssegundo midia migratorio mimosa
minuto miosotis mirtilo misturar mitzvah miudos mixuruca mnemonico moagem mobilizar modulo moer mofo mogno moita
molusco monumento moqueca morubixaba mostruario motriz mouse movivel mozarela muarra muculmano mudo mugir muitos
mumunha munir muon muquira murros musselina nacoes nado naftalina nago naipe naja nalgum namoro nanquim napolitano
naquilo nascimento nautilo navios nazista nebuloso nectarina nefrologo negus nelore nenufar nepotismo nervura neste
netuno neutron nevoeiro newtoniano nexo nhenhenhem nhoque nigeriano niilista ninho niobio niponico niquelar nirvana
nisto nitroglicerina nivoso nobreza nocivo noel nogueira noivo nojo nominativo nonuplo noruegues nostalgico noturno
nouveau nuanca nublar nucleotideo nudista nulo numismatico nunquinha nupcias nutritivo nuvens oasis obcecar obeso
obituario objetos oblongo obnoxio obrigatorio obstruir obtuso obus obvio ocaso occipital oceanografo ocioso oclusivo
ocorrer ocre octogono odalisca odisseia odorifico oersted oeste ofertar ofidio oftalmologo ogiva ogum oigale oitavo
oitocentos ojeriza olaria oleoso olfato olhos oliveira olmo olor olvidavel ombudsman omeleteira omitir omoplata
onanismo ondular oneroso onomatopeico ontologico onus onze opalescente opcional operistico opio oposto oprobrio
optometrista opusculo oratorio orbital orcar orfao orixa orla ornitologo orquidea ortorrombico orvalho osculo osmotico
ossudo ostrogodo otario otite ouro ousar outubro ouvir ovario overnight oviparo ovni ovoviviparo ovulo oxala oxente
oxiuro oxossi ozonizar paciente pactuar padronizar paete pagodeiro paixao pajem paludismo pampas panturrilha papudo
paquistanes pastoso patua paulo pauzinhos pavoroso paxa pazes peao pecuniario pedunculo pegaso peixinho pejorativo
pelvis penuria pequno petunia pezada piauiense pictorico pierro pigmeu pijama pilulas pimpolho pintura piorar pipocar
piqueteiro pirulito pistoleiro pituitaria pivotar pixote pizzaria plistoceno plotar pluviometrico pneumonico poco
podridao poetisa pogrom pois polvorosa pomposo ponderado pontudo populoso poquer porvir posudo potro pouso povoar
prazo prezar privilegios proximo prussiano pseudopode psoriase pterossauros ptialina ptolemaico pudor pueril pufe
pugilista puir pujante pulverizar pumba punk purulento pustula putsch puxe quatrocentos quetzal quixotesco quotizavel
rabujice racista radonio rafia ragu rajado ralo rampeiro ranzinza raptor raquitismo raro rasurar ratoeira ravioli
razoavel reavivar rebuscar recusavel reduzivel reexposicao refutavel regurgitar reivindicavel rejuvenescimento relva
remuneravel renunciar reorientar repuxo requisito resumo returno reutilizar revolvido rezonear riacho ribossomo ricota
ridiculo rifle rigoroso rijo rimel rins rios riqueza respeito rissole ritualistico rivalizar rixa robusto rococo
rodoviario roer rogo rojao rolo rompimento ronronar roqueiro rorqual rosto rotundo rouxinol roxo royal ruas rucula
rudimentos ruela rufo rugoso ruivo rule rumoroso runico ruptura rural rustico rutilar saariano sabujo sacudir
sadomasoquista safra sagui sais samurai santuario sapo saquear sartriano saturno saude sauva saveiro saxofonista
sazonal scherzo script seara seborreia secura seduzir sefardim seguro seja selvas sempre senzala sepultura sequoia
sestercio setuplo seus seviciar sezonismo shalom siames sibilante sicrano sidra sifilitico signos silvo simultaneo
sinusite sionista sirio sisudo situar sivan slide slogan soar sobrio socratico sodomizar soerguer software sogro soja
solver somente sonso sopro soquete sorveteiro sossego soturno sousafone sovinice sozinho suavizar subverter sucursal
sudoriparo sufragio sugestoes suite sujo sultao sumula suntuoso suor supurar suruba susto suturar suvenir tabuleta
taco tadjique tafeta tagarelice taitiano talvez tampouco tanzaniano taoista tapume taquion tarugo tascar tatuar
tautologico tavola taxionomista tchecoslovaco teatrologo tectonismo tedioso teflon tegumento teixo telurio temporas
tenue teosofico tepido tequila terrorista testosterona tetrico teutonico teve texugo tiara tibia tiete tifoide tigresa
tijolo tilintar timpano tintureiro tiquete tiroteio tisico titulos tive toar toboga tofu togoles toicinho tolueno
tomografo tontura toponimo toquio torvelinho tostar toto touro toxina trazer trezentos trivialidade trovoar truta
tuaregue tubular tucano tudo tufo tuiste tulipa tumultuoso tunisino tupiniquim turvo tutu ucraniano udenista ufanista
ufologo ugaritico uiste uivo ulceroso ulema ultravioleta umbilical umero umido umlaut unanimidade unesco ungulado
unheiro univoco untuoso urano urbano urdir uretra urgente urinol urna urologo urro ursulina urtiga urupe usavel
usbeque usei usineiro usurpar utero utilizar utopico uvular uxoricidio vacuo vadio vaguear vaivem valvula vampiro
vantajoso vaporoso vaquinha varziano vasto vaticinio vaudeville vazio veado vedico veemente vegetativo veio veja
veludo venusiano verdade verve vestuario vetusto vexatorio vezes viavel vibratorio victor vicunha vidros vietnamita
vigoroso vilipendiar vime vintem violoncelo viquingue virus visualizar vituperio viuvo vivo vizir voar vociferar vodu
vogar voile volver vomito vontade vortice vosso voto vovozinha voyeuse vozes vulva vupt western xadrez xale xampu
xango xarope xaual xavante xaxim xenonio xepa xerox xicara xifopago xiita xilogravura xinxim xistoso xixi xodo xogum
xucro zabumba zagueiro zambiano zanzar zarpar zebu zefiro zeloso zenite zumbi`.split(/\s+/);`abandon abattre aboi abolir aborder abri absence absolu abuser acacia acajou accent accord accrocher accuser acerbe
achat acheter acide acier acquis acte action adage adepte adieu admettre admis adorer adresser aduler affaire affirmer
afin agacer agent agir agiter agonie agrafe agrume aider aigle aigre aile ailleurs aimant aimer ainsi aise ajouter
alarme album alcool alerte algue alibi aller allumer alors amande amener amie amorcer amour ample amuser ananas ancien
anglais angoisse animal anneau annoncer apercevoir apparence appel apporter apprendre appuyer arbre arcade arceau
arche ardeur argent argile aride arme armure arracher arriver article asile aspect assaut assez assister assurer astre
astuce atlas atroce attacher attente attirer aube aucun audace auparavant auquel aurore aussi autant auteur autoroute
autre aval avant avec avenir averse aveu avide avion avis avoir avouer avril azote azur badge bagage bague bain
baisser balai balcon balise balle bambou banane banc bandage banjo banlieue bannir banque baobab barbe barque barrer
bassine bataille bateau battre baver bavoir bazar beau beige berger besoin beurre biais biceps bidule bien bijou bilan
billet blanc blason bleu bloc blond bocal boire boiserie boiter bonbon bondir bonheur bordure borgne borner bosse
bouche bouder bouger boule bourse bout boxe brader braise branche braquer bras brave brebis brevet brider briller brin
brique briser broche broder bronze brosser brouter bruit brute budget buffet bulle bureau buriner buste buter butiner
cabas cabinet cabri cacao cacher cadeau cadre cage caisse caler calme camarade camion campagne canal canif capable
capot carat caresser carie carpe cartel casier casque casserole cause cavale cave ceci cela celui cendre cent
cependant cercle cerise cerner certes cerveau cesser chacun chair chaleur chamois chanson chaque charge chasse chat
chaud chef chemin cheveu chez chicane chien chiffre chiner chiot chlore choc choix chose chou chute cibler cidre ciel
cigale cinq cintre cirage cirque ciseau citation citer citron civet clairon clan classe clavier clef climat cloche
cloner clore clos clou club cobra cocon coiffer coin colline colon combat comme compte conclure conduire confier connu
conseil contre convenir copier cordial cornet corps cosmos coton couche coude couler coupure cour couteau couvrir
crabe crainte crampe cran creuser crever crier crime crin crise crochet croix cruel cuisine cuite culot culte cumul
cure curieux cuve dame danger dans davantage debout dedans dehors delta demain demeurer demi dense dent depuis dernier
descendre dessus destin dette deuil deux devant devenir devin devoir dicton dieu difficile digestion digue diluer
dimanche dinde diode dire diriger discours disposer distance divan divers docile docteur dodu dogme doigt dominer
donation donjon donner dopage dorer dormir doseur douane double douche douleur doute doux douzaine draguer drame drap
dresser droit duel dune duper durant durcir durer eaux effacer effet effort effrayant elle embrasser emmener emparer
empire employer emporter enclos encore endive endormir endroit enduit enfant enfermer enfin enfler enfoncer enfuir
engager engin enjeu enlever ennemi ennui ensemble ensuite entamer entendre entier entourer entre envelopper envie
envoyer erreur escalier espace espoir esprit essai essor essuyer estimer exact examiner excuse exemple exiger exil
exister exode expliquer exposer exprimer extase fable facette facile fade faible faim faire fait falloir famille faner
farce farine fatigue faucon faune faute faux faveur favori faxer feinter femme fendre fente ferme festin feuille
feutre fiable fibre ficher fier figer figure filet fille filmer fils filtre final finesse finir fiole firme fixe
flacon flair flamme flan flaque fleur flocon flore flot flou fluide fluor flux focus foin foire foison folie fonction
fondre fonte force forer forger forme fort fosse fouet fouine foule four foyer frais franc frapper freiner frimer
friser frite froid froncer fruit fugue fuir fuite fumer fureur furieux fuser fusil futile futur gagner gain gala galet
galop gamme gant garage garde garer gauche gaufre gaule gaver gazon geler genou genre gens gercer germer geste gibier
gicler gilet girafe givre glace glisser globe gloire gluant gober golf gommer gorge gosier goutte grain gramme grand
gras grave gredin griffure griller gris gronder gros grotte groupe grue guerrier guetter guider guise habiter hache
haie haine halte hamac hanche hangar hanter haras hareng harpe hasard hausse haut havre herbe heure hibou hier
histoire hiver hochet homme honneur honte horde horizon hormone houle housse hublot huile huit humain humble humide
humour hurler idole igloo ignorer illusion image immense immobile imposer impression incapable inconnu index indiquer
infime injure inox inspirer instant intention intime inutile inventer inviter iode iris issue ivre jade jadis jamais
jambe janvier jardin jauge jaunisse jeter jeton jeudi jeune joie joindre joli joueur journal judo juge juillet juin
jument jungle jupe jupon jurer juron jury jusque juste kayak ketchup kilo kiwi koala label lacet lacune laine laisse
lait lame lancer lande laque lard largeur larme larve lasso laver lendemain lentement lequel lettre leur lever levure
liane libre lien lier lieutenant ligne ligoter liguer limace limer limite lingot lion lire lisser litre livre lobe
local logis loin loisir long loque lors lotus louer loup lourd louve loyer lubie lucide lueur luge luire lundi lune
lustre lutin lutte luxe machine madame magie magnifique magot maigre main mairie maison malade malheur malin manche
manger manier manoir manquer marche mardi marge mariage marquer mars masque masse matin mauvais meilleur melon membre
menacer mener mensonge mentir menu merci merlu mesure mettre meuble meunier meute miche micro midi miel miette mieux
milieu mille mimer mince mineur ministre minute mirage miroir miser mite mixte mobile mode module moins mois moment
momie monde monsieur monter moquer moral morceau mordre morose morse mortier morue motif motte moudre moule mourir
mousse mouton mouvement moyen muer muette mugir muguet mulot multiple munir muret muse musique muter nacre nager nain
naissance narine narrer naseau nasse nation nature naval navet naviguer navrer neige nerf nerveux neuf neutre neuve
neveu niche nier niveau noble noce nocif noir nomade nombre nommer nord norme notaire notice notre nouer nougat
nourrir nous nouveau novice noyade noyer nuage nuance nuire nuit nulle nuque oasis objet obliger obscur observer
obtenir obus occasion occuper ocre octet odeur odorat offense officier offrir ogive oiseau olive ombre onctueux
onduler ongle onze opter option orageux oral orange orbite ordinaire ordre oreille organe orgie orgueil orient origan
orner orteil ortie oser osselet otage otarie ouate oublier ouest ours outil outre ouvert ouvrir ovale ozone pacte page
paille pain paire paix palace palissade palmier palpiter panda panneau papa papier paquet parc pardi parfois parler
parmi parole partir parvenir passer pastel patin patron paume pause pauvre paver pavot payer pays peau peigne peinture
pelage pelote pencher pendre penser pente percer perdu perle permettre personne perte peser pesticide petit peuple
peur phase photo phrase piano pied pierre pieu pile pilier pilote pilule piment pincer pinson pinte pion piquer pirate
pire piste piton pitre pivot pizza placer plage plaire plan plaque plat plein pleurer pliage plier plonger plot pluie
plume plus pneu poche podium poids poil point poire poison poitrine poivre police pollen pomme pompier poncer pondre
pont portion poser position possible poste potage potin pouce poudre poulet poumon poupe pour pousser poutre pouvoir
prairie premier prendre presque preuve prier primeur prince prison priver prix prochain produire profond proie projet
promener prononcer propre prose prouver prune public puce pudeur puiser pull pulpe puma punir purge putois quand
quartier quasi quatre quel question queue quiche quille quinze quitter quoi rabais raboter race racheter racine racler
raconter radar radio rafale rage ragot raideur raie rail raison ramasser ramener rampe rance rang rapace rapide
rapport rarement rasage raser rasoir rassurer rater ratio rature ravage ravir rayer rayon rebond recevoir recherche
record reculer redevenir refuser regard regretter rein rejeter rejoindre relation relever religion remarquer remettre
remise remonter remplir remuer rencontre rendre renier renoncer rentrer renverser repas repli reposer reproche requin
respect ressembler reste retard retenir retirer retour retrouver revenir revoir revue rhume ricaner riche rideau
ridicule rien rigide rincer rire risquer rituel rivage rive robe robot robuste rocade roche rodeur rogner roman rompre
ronce rondeur ronger roque rose rosir rotation rotule roue rouge rouler route ruban rubis ruche rude ruelle ruer rugby
rugir ruine rumeur rural ruse rustre sable sabot sabre sacre sage saint saisir salade salive salle salon salto salut
salve samba sandale sanguin sapin sarcasme satisfaire sauce sauf sauge saule sauna sauter sauver savoir science scoop
score second secret secte seigneur sein seize selle selon semaine sembler semer semis sensuel sentir sept serpe serrer
sertir service seuil seulement short sien sigle signal silence silo simple singe sinon sinus sioux sirop site
situation skier snob sobre social socle sodium soigner soir soixante soja solaire soldat soleil solide solo solvant
sombre somme somnoler sondage songeur sonner sorte sosie sottise souci soudain souffrir souhaiter soulever soumettre
soupe sourd soustraire soutenir souvent soyeux spectacle sport stade stagiaire stand star statue stock stop store
style suave subir sucre suer suffire suie suite suivre sujet sulfite supposer surf surprendre surtout surveiller tabac
table tabou tache tacler tacot tact taie taille taire talon talus tandis tango tanin tant taper tapis tard tarif tarot
tarte tasse taureau taux taverne taxer taxi tellement temple tendre tenir tenter tenu terme ternir terre test texte
thym tibia tiers tige tipi tique tirer tissu titre toast toge toile toiser toiture tomber tome tonne tonte toque torse
tortue totem toucher toujours tour tousser tout toux trace train trame tranquille travail trembler trente tribu trier
trio tripe triste troc trois tromper tronc trop trotter trouer truc truite tuba tuer tuile turbo tutu tuyau type union
unique unir unisson untel urne usage user usiner usure utile vache vague vaincre valeur valoir valser valve vampire
vaseux vaste veau veille veine velours velu vendre venir vent venue verbe verdict version vertige verve veste veto
vexer vice victime vide vieil vieux vigie vigne ville vingt violent virer virus visage viser visite visuel vitamine
vitrine vivant vivre vocal vodka vogue voici voile voir voisin voiture volaille volcan voler volt votant votre vouer
vouloir vous voyage voyou vrac vrai yacht yeti yeux yoga zeste zinc zone zoom`.split(/\s+/),`abbinare abbonato abisso abitare abominio accadere accesso acciaio accordo accumulo acido acqua acrobata acustico
adattare addetto addio addome adeguato aderire adorare adottare adozione adulto aereo aerobica affare affetto affidare
affogato affronto africano afrodite agenzia aggancio aggeggio aggiunta agio agire agitare aglio agnello agosto aiutare
albero albo alce alchimia alcool alfabeto algebra alimento allarme alleanza allievo alloggio alluce alpi alterare
altro aluminio amante amarezza ambiente ambrosia america amico ammalare ammirare amnesia amnistia amore ampliare
amputare analisi anamnesi ananas anarchia anatra anca ancorato andare androide aneddoto anello angelo angolino
anguilla anidride anima annegare anno annuncio anomalia antenna anticipo aperto apostolo appalto appello appiglio
applauso appoggio appurare aprile aquila arabo arachidi aragosta arancia arbitrio archivio arco argento argilla aria
ariete arma armonia aroma arrivare arrosto arsenale arte artiglio asfalto asfissia asino asparagi aspirina assalire
assegno assolto assurdo asta astratto atlante atletica atomo atropina attacco attesa attico atto attrarre auguri aula
aumento aurora auspicio autista auto autunno avanzare avarizia avere aviatore avido avorio avvenire avviso avvocato
azienda azione azzardo azzurro babbuino bacio badante baffi bagaglio bagliore bagno balcone balena ballare balordo
balsamo bambola bancomat banda barato barba barista barriera basette basilico bassista bastare battello bavaglio
beccare beduino bellezza bene benzina berretto bestia bevitore bianco bibbia biberon bibita bici bidone bilancia
biliardo binario binocolo biologia biondina biopsia biossido birbante birra biscotto bisogno bistecca bivio blindare
bloccare bocca bollire bombola bonifico borghese borsa bottino botulino braccio bradipo branco bravo bresaola bretelle
brevetto briciola brigante brillare brindare brivido broccoli brontolo bruciare brufolo bucare buddista budino bufera
buffo bugiardo buio buono burrone bussola bustina buttare cabernet cabina cacao cacciare cactus cadavere caffe
calamari calcio caldaia calmare calunnia calvario calzone cambiare camera camion cammello campana canarino cancello
candore cane canguro cannone canoa cantare canzone caos capanna capello capire capo capperi capra capsula caraffa
carbone carciofo cardigan carenza caricare carota carrello carta casa cascare caserma cashmere casino cassetta
castello catalogo catena catorcio cattivo causa cauzione cavallo caverna caviglia cavo cazzotto celibato cemento
cenare centrale ceramica cercare ceretta cerniera certezza cervello cessione cestino cetriolo chiave chiedere chilo
chimera chiodo chirurgo chitarra chiudere ciabatta ciao cibo ciccia cicerone ciclone cicogna cielo cifra cigno
ciliegia cimitero cinema cinque cintura ciondolo ciotola cipolla cippato circuito cisterna citofono ciuccio civetta
civico clausola cliente clima clinica cobra coccole cocktail cocomero codice coesione cogliere cognome colla colomba
colpire coltello comando comitato commedia comodino compagna comune concerto condotto conforto congiura coniglio
consegna conto convegno coperta copia coprire corazza corda corleone cornice corona corpo corrente corsa cortesia
corvo coso costume cotone cottura cozza crampo cratere cravatta creare credere crema crescere crimine criterio croce
crollare cronaca crostata croupier cubetto cucciolo cucina cultura cuoco cuore cupido cupola cura curva cuscino
custode danzare data decennio decidere decollo dedicare dedurre definire delegare delfino delitto demone dentista
denuncia deposito derivare deserto designer destino detonare dettagli diagnosi dialogo diamante diario diavolo
dicembre difesa digerire digitare diluvio dinamica dipinto diploma diramare dire dirigere dirupo discesa disdetta
disegno disporre dissenso distacco dito ditta diva divenire dividere divorare docente dolcetto dolore domatore
domenica dominare donatore donna dorato dormire dorso dosaggio dottore dovere download dragone dramma dubbio dubitare
duetto durata ebbrezza eccesso eccitare eclissi economia edera edificio editore edizione educare effetto egitto
egiziano elastico elefante eleggere elemento elenco elezione elmetto elogio embrione emergere emettere eminenza
emisfero emozione empatia energia enfasi enigma entrare enzima epidemia epilogo episodio epoca equivoco erba erede
eroe erotico errore eruzione esaltare esame esaudire eseguire esempio esigere esistere esito esperto espresso essere
estasi esterno estrarre eterno etica euforico europa evacuare evasione evento evidenza evitare evolvere fabbrica
facciata fagiano fagotto falco fame famiglia fanale fango fantasia farfalla farmacia faro fase fastidio faticare fatto
favola febbre femmina femore fenomeno fermata feromoni ferrari fessura festa fiaba fiamma fianco fiat fibbia fidare
fieno figa figlio figura filetto filmato filosofo filtrare finanza finestra fingere finire finta finzione fiocco
fioraio firewall firmare fisico fissare fittizio fiume flacone flagello flirtare flusso focaccia foglio fognario
follia fonderia fontana forbici forcella foresta forgiare formare fornace foro fortuna forzare fosforo fotoni fracasso
fragola frantumi fratello frazione freccia freddo frenare fresco friggere frittata frivolo frizione fronte frullato
frumento frusta frutto fucile fuggire fulmine fumare funzione fuoco furbizia furgone furia furore fusibile fuso futuro
gabbiano galassia gallina gamba gancio garanzia garofano gasolio gatto gazebo gazzetta gelato gemelli generare
genitori gennaio geologia germania gestire gettare ghepardo ghiaccio giaccone giaguaro giallo giappone giardino
gigante gioco gioiello giorno giovane giraffa giudizio giurare giusto globo gloria glucosio gnocca gocciola godere
gomito gomma gonfiare gorilla governo gradire graffiti granchio grappolo grasso grattare gridare grissino grondaia
grugnito gruppo guadagno guaio guancia guardare gufo guidare guscio gusto icona idea identico idolo idoneo idrante
idrogeno igiene ignoto imbarco immagine immobile imparare impedire impianto importo impresa impulso incanto incendio
incidere incontro incrocia incubo indagare indice indotto infanzia inferno infinito infranto ingerire inglese ingoiare
ingresso iniziare innesco insalata inserire insicuro insonnia insulto interno introiti invasori inverno invito
invocare ipnosi ipocrita ipotesi ironia irrigare iscritto isola ispirare isterico istinto istruire italiano jazz
labbra labrador ladro lago lamento lampone lancetta lanterna lapide larva lasagne lasciare lastra latte laurea lavagna
lavorare leccare legare leggere lenzuolo leone lepre letargo lettera levare levitare lezione liberare libidine libro
licenza lievito limite lince lingua liquore lire listino litigare litro locale lottare lucciola lucidare luglio luna
macchina madama madre maestro maggio magico maglione magnolia mago maialino maionese malattia male malloppo mancare
mandorla mangiare manico manopola mansarda mantello manubrio manzo mappa mare margine marinaio marmotta marocco
martello marzo maschera matrice maturare mazzetta meandri medaglia medico medusa megafono melone membrana menta
mercato meritare merluzzo mese mestiere metafora meteo metodo mettere miele miglio miliardo mimetica minatore minuto
miracolo mirtillo missile mistero misura mito mobile moda moderare moglie molecola molle momento moneta mongolia
monologo montagna morale morbillo mordere mosaico mosca mostro motivare moto mulino mulo muovere muraglia muscolo
museo musica mutande nascere nastro natale natura nave navigare negare negozio nemico nero nervo nessuno nettare
neutroni neve nevicare nicotina nido nipote nocciola noleggio nome nonno norvegia notare notizia nove nucleo nuda
nuotare nutrire obbligo occhio occupare oceano odissea odore offerta officina offrire oggetto oggi olfatto olio oliva
ombelico ombrello omuncolo ondata onore opera opinione opuscolo opzione orario orbita orchidea ordine orecchio orgasmo
orgoglio origine orologio oroscopo orso oscurare ospedale ospite ossigeno ostacolo ostriche ottenere ottimo ottobre
ovest pacco pace pacifico padella pagare pagina pagnotta palazzo palestra palpebre pancetta panfilo panino pannello
panorama papa paperino paradiso parcella parente parlare parodia parrucca partire passare pasta patata patente
patogeno patriota pausa pazienza peccare pecora pedalare pelare pena pendenza penisola pennello pensare pentirsi
percorso perdono perfetto perizoma perla permesso persona pesare pesce peso petardo petrolio pezzo piacere pianeta
piastra piatto piazza piccolo piede piegare pietra pigiama pigliare pigrizia pilastro pilota pinguino pioggia piombo
pionieri piovra pipa pirata pirolisi piscina pisolino pista pitone piumino pizza plastica platino poesia poiana
polaroid polenta polimero pollo polmone polpetta poltrona pomodoro pompa popolo porco porta porzione possesso postino
potassio potere poverino pranzo prato prefisso prelievo premio prendere prestare pretesa prezzo primario privacy
problema processo prodotto profeta progetto promessa pronto proposta proroga prossimo proteina prova prudenza pubblico
pudore pugilato pulire pulsante puntare pupazzo puzzle quaderno qualcuno quarzo quercia quintale rabbia racconto
radice raffica ragazza ragione rammento ramo rana randagio rapace rapinare rapporto rasatura ravioli reagire realista
reattore reazione recitare recluso record recupero redigere regalare regina regola relatore reliquia remare rendere
reparto resina resto rete retorica rettile revocare riaprire ribadire ribelle ricambio ricetta richiamo ricordo
ridurre riempire riferire riflesso righello rilancio rilevare rilievo rimanere rimborso rinforzo rinuncia riparo
ripetere riposare ripulire risalita riscatto riserva riso rispetto ritaglio ritmo ritorno ritratto rituale riunione
riuscire riva robotica rondine rosa rospo rosso rotonda rotta roulotte rubare rubrica ruffiano rumore ruota ruscello
sabbia sacco saggio sale salire salmone salto salutare salvia sangue sanzioni sapere sapienza sarcasmo sardine
sartoria sbalzo sbarcare sberla sborsare scadenza scafo scala scambio scappare scarpa scatola scelta scena sceriffo
scheggia schiuma sciarpa scienza scimmia sciopero scivolo sclerare scolpire sconto scopa scordare scossa scrivere
scrupolo scuderia scultore scuola scusare sdraiare secolo sedativo sedere sedia segare segreto seguire semaforo seme
senape seno sentiero separare sepolcro sequenza serata serpente servizio sesso seta settore sfamare sfera sfidare
sfiorare sfogare sgabello sicuro siepe sigaro silenzio silicone simbiosi simpatia simulare sinapsi sindrome sinergia
sinonimo sintonia sirena siringa sistema sito smalto smentire smontare soccorso socio soffitto software soggetto
sogliola sognare soldi sole sollievo solo sommario sondare sonno sorpresa sorriso sospiro sostegno sovrano spaccare
spada spagnolo spalla sparire spavento spazio specchio spedire spegnere spendere speranza spessore spezzare spiaggia
spiccare spiegare spiffero spingere sponda sporcare spostare spremuta spugna spumante spuntare squadra squillo
staccare stadio stagione stallone stampa stancare starnuto statura stella stendere sterzo stilista stimolo stinco
stiva stoffa storia strada stregone striscia studiare stufa stupendo subire successo sudare suono superare supporto
surfista sussurro svelto svenire sviluppo svolta svuotare tabacco tabella tabu tacchino tacere taglio talento tangente
tappeto tartufo tassello tastiera tavolo tazza teatro tedesco telaio telefono tema temere tempo tendenza tenebre
tensione tentare teologia teorema termica terrazzo teschio tesi tesoro tessera testa thriller tifoso tigre timbrare
timido tinta tirare tisana titano titolo toccare togliere topolino torcia torrente tovaglia traffico tragitto training
tramonto transito trapezio trasloco trattore trazione treccia tregua treno triciclo tridente trilogia tromba troncare
trota trovare trucco tubo tulipano tumulto tunisia tuono turista tuta tutelare tutore ubriaco uccello udienza udito
uffa umanoide umore unghia unguento unicorno unione universo uomo uragano uranio urlare uscire utente utilizzo vacanza
vacca vaglio vagonata valle valore valutare valvola vampiro vaniglia vanto vapore variante vasca vaselina vassoio
vedere vegetale veglia veicolo vela veleno velivolo velluto vendere venerare venire vento veranda verbo verdura
vergine verifica vernice vero verruca versare vertebra vescica vespaio vestito vesuvio veterano vetro vetta viadotto
viaggio vibrare vicenda vichingo vietare vigilare vigneto villa vincere violino vipera virgola virtuoso visita vita
vitello vittima vivavoce vivere viziato voglia volare volpe volto volume vongole voragine vortice votare vulcano
vuotare zabaione zaffiro zainetto zampa zanzara zattera zavorra zenzero zero zingaro zittire zoccolo zolfo zombie
zucchero`.split(/\s+/),`あいこくしん あいさつ あいだ あおぞら あかちゃん あきる あけがた あける あこがれる あさい あさひ あしあと あじわう あずかる あずき あそぶ あたえる あたためる あたりまえ あたる あつい あつかう あっしゅく あつまり
あつめる あてな あてはまる あひる あぶら あぶる あふれる あまい あまど あまやかす あまり あみもの あめりか あやまる あゆむ あらいぐま あらし あらすじ あらためる あらゆる あらわす ありがとう あわせる あわてる
あんい あんがい あんこ あんぜん あんてい あんない あんまり いいだす いおん いがい いがく いきおい いきなり いきもの いきる いくじ いくぶん いけばな いけん いこう いこく いこつ いさましい いさん いしき いじゅう
いじょう いじわる いずみ いずれ いせい いせえび いせかい いせき いぜん いそうろう いそがしい いだい いだく いたずら いたみ いたりあ いちおう いちじ いちど いちば いちぶ いちりゅう いつか いっしゅん いっせい
いっそう いったん いっち いってい いっぽう いてざ いてん いどう いとこ いない いなか いねむり いのち いのる いはつ いばる いはん いびき いひん いふく いへん いほう いみん いもうと いもたれ いもり いやがる
いやす いよかん いよく いらい いらすと いりぐち いりょう いれい いれもの いれる いろえんぴつ いわい いわう いわかん いわば いわゆる いんげんまめ いんさつ いんしょう いんよう うえき うえる うおざ うがい うかぶ
うかべる うきわ うくらいな うくれれ うけたまわる うけつけ うけとる うけもつ うける うごかす うごく うこん うさぎ うしなう うしろがみ うすい うすぎ うすぐらい うすめる うせつ うちあわせ うちがわ うちき うちゅう
うっかり うつくしい うったえる うつる うどん うなぎ うなじ うなずく うなる うねる うのう うぶげ うぶごえ うまれる うめる うもう うやまう うよく うらがえす うらぐち うらない うりあげ うりきれ うるさい うれしい
うれゆき うれる うろこ うわき うわさ うんこう うんちん うんてん うんどう えいえん えいが えいきょう えいご えいせい えいぶん えいよう えいわ えおり えがお えがく えきたい えくせる えしゃく えすて えつらん えのぐ
えほうまき えほん えまき えもじ えもの えらい えらぶ えりあ えんえん えんかい えんぎ えんげき えんしゅう えんぜつ えんそく えんちょう えんとつ おいかける おいこす おいしい おいつく おうえん おうさま おうじ
おうせつ おうたい おうふく おうべい おうよう おえる おおい おおう おおどおり おおや おおよそ おかえり おかず おがむ おかわり おぎなう おきる おくさま おくじょう おくりがな おくる おくれる おこす おこなう おこる
おさえる おさない おさめる おしいれ おしえる おじぎ おじさん おしゃれ おそらく おそわる おたがい おたく おだやか おちつく おっと おつり おでかけ おとしもの おとなしい おどり おどろかす おばさん おまいり おめでとう
おもいで おもう おもたい おもちゃ おやつ おやゆび およぼす おらんだ おろす おんがく おんけい おんしゃ おんせん おんだん おんちゅう おんどけい かあつ かいが がいき がいけん がいこう かいさつ かいしゃ かいすいよく
かいぜん かいぞうど かいつう かいてん かいとう かいふく がいへき かいほう かいよう がいらい かいわ かえる かおり かかえる かがく かがし かがみ かくご かくとく かざる がぞう かたい かたち がちょう がっきゅう
がっこう がっさん がっしょう かなざわし かのう がはく かぶか かほう かほご かまう かまぼこ かめれおん かゆい かようび からい かるい かろう かわく かわら がんか かんけい かんこう かんしゃ かんそう かんたん かんち
がんばる きあい きあつ きいろ ぎいん きうい きうん きえる きおう きおく きおち きおん きかい きかく きかんしゃ ききて きくばり きくらげ きけんせい きこう きこえる きこく きさい きさく きさま きさらぎ ぎじかがく
ぎしき ぎじたいけん ぎじにってい ぎじゅつしゃ きすう きせい きせき きせつ きそう きぞく きぞん きたえる きちょう きつえん ぎっちり きつつき きつね きてい きどう きどく きない きなが きなこ きぬごし きねん きのう
きのした きはく きびしい きひん きふく きぶん きぼう きほん きまる きみつ きむずかしい きめる きもだめし きもち きもの きゃく きやく ぎゅうにく きよう きょうりゅう きらい きらく きりん きれい きれつ きろく
ぎろん きわめる ぎんいろ きんかくじ きんじょ きんようび ぐあい くいず くうかん くうき くうぐん くうこう ぐうせい くうそう ぐうたら くうふく くうぼ くかん くきょう くげん ぐこう くさい くさき くさばな くさる
くしゃみ くしょう くすのき くすりゆび くせげ くせん ぐたいてき くださる くたびれる くちこみ くちさき くつした ぐっすり くつろぐ くとうてん くどく くなん くねくね くのう くふう くみあわせ くみたてる くめる
くやくしょ くらす くらべる くるま くれる くろう くわしい ぐんかん ぐんしょく ぐんたい ぐんて けあな けいかく けいけん けいこ けいさつ げいじゅつ けいたい げいのうじん けいれき けいろ けおとす けおりもの げきか
げきげん げきだん げきちん げきとつ げきは げきやく げこう げこくじょう げざい けさき げざん けしき けしごむ けしょう げすと けたば けちゃっぷ けちらす けつあつ けつい けつえき けっこん けつじょ けっせき けってい
けつまつ げつようび げつれい けつろん げどく けとばす けとる けなげ けなす けなみ けぬき げねつ けねん けはい げひん けぶかい げぼく けまり けみかる けむし けむり けもの けらい けろけろ けわしい けんい けんえつ
けんお けんか げんき けんげん けんこう けんさく けんしゅう けんすう げんそう けんちく けんてい けんとう けんない けんにん げんぶつ けんま けんみん けんめい けんらん けんり こあくま こいぬ こいびと ごうい こうえん
こうおん こうかん ごうきゅう ごうけい こうこう こうさい こうじ こうすい ごうせい こうそく こうたい こうちゃ こうつう こうてい こうどう こうない こうはい ごうほう ごうまん こうもく こうりつ こえる こおり ごかい
ごがつ ごかん こくご こくさい こくとう こくない こくはく こぐま こけい こける ここのか こころ こさめ こしつ こすう こせい こせき こぜん こそだて こたい こたえる こたつ こちょう こっか こつこつ こつばん こつぶ
こてい こてん ことがら ことし ことば ことり こなごな こねこね このまま このみ このよ ごはん こひつじ こふう こふん こぼれる ごまあぶら こまかい ごますり こまつな こまる こむぎこ こもじ こもち こもの こもん
こやく こやま こゆう こゆび こよい こよう こりる これくしょん ころっけ こわもて こわれる こんいん こんかい こんき こんしゅう こんすい こんだて こんとん こんなん こんびに こんぽん こんまけ こんや こんれい こんわく
ざいえき さいかい さいきん ざいげん ざいこ さいしょ さいせい ざいたく ざいちゅう さいてき ざいりょう さうな さかいし さがす さかな さかみち さがる さぎょう さくし さくひん さくら さこく さこつ さずかる ざせき
さたん さつえい ざつおん ざっか ざつがく さっきょく ざっし さつじん ざっそう さつたば さつまいも さてい さといも さとう さとおや さとし さとる さのう さばく さびしい さべつ さほう さほど さます さみしい さみだれ
さむけ さめる さやえんどう さゆう さよう さよく さらだ ざるそば さわやか さわる さんいん さんか さんきゃく さんこう さんさい ざんしょ さんすう さんせい さんそ さんち さんま さんみ さんらん しあい しあげ
しあさって しあわせ しいく しいん しうち しえい しおけ しかい しかく じかん しごと しすう じだい したうけ したぎ したて したみ しちょう しちりん しっかり しつじ しつもん してい してき してつ じてん じどう
しなぎれ しなもの しなん しねま しねん しのぐ しのぶ しはい しばかり しはつ しはらい しはん しひょう しふく じぶん しへい しほう しほん しまう しまる しみん しむける じむしょ しめい しめる しもん しゃいん
しゃうん しゃおん じゃがいも しやくしょ しゃくほう しゃけん しゃこ しゃざい しゃしん しゃせん しゃそう しゃたい しゃちょう しゃっきん じゃま しゃりん しゃれい じゆう じゅうしょ しゅくはく じゅしん しゅっせき しゅみ
しゅらば じゅんばん しょうかい しょくたく しょっけん しょどう しょもつ しらせる しらべる しんか しんこう じんじゃ しんせいじ しんちく しんりん すあげ すあし すあな ずあん すいえい すいか すいとう ずいぶん
すいようび すうがく すうじつ すうせん すおどり すきま すくう すくない すける すごい すこし ずさん すずしい すすむ すすめる すっかり ずっしり ずっと すてき すてる すねる すのこ すはだ すばらしい ずひょう ずぶぬれ
すぶり すふれ すべて すべる ずほう すぼん すまい すめし すもう すやき すらすら するめ すれちがう すろっと すわる すんぜん すんぽう せあぶら せいかつ せいげん せいじ せいよう せおう せかいかん せきにん せきむ
せきゆ せきらんうん せけん せこう せすじ せたい せたけ せっかく せっきゃく ぜっく せっけん せっこつ せっさたくま せつぞく せつだん せつでん せっぱん せつび せつぶん せつめい せつりつ せなか せのび せはば せびろ
せぼね せまい せまる せめる せもたれ せりふ ぜんあく せんい せんえい せんか せんきょ せんく せんげん ぜんご せんさい せんしゅ せんすい せんせい せんぞ せんたく せんちょう せんてい せんとう せんぬき せんねん
せんぱい ぜんぶ ぜんぽう せんむ せんめんじょ せんもん せんやく せんゆう せんよう ぜんら ぜんりゃく せんれい せんろ そあく そいとげる そいね そうがんきょう そうき そうご そうしん そうだん そうなん そうび そうめん
そうり そえもの そえん そがい そげき そこう そこそこ そざい そしな そせい そせん そそぐ そだてる そつう そつえん そっかん そつぎょう そっけつ そっこう そっせん そっと そとがわ そとづら そなえる そなた そふぼ
そぼく そぼろ そまつ そまる そむく そむりえ そめる そもそも そよかぜ そらまめ そろう そんかい そんけい そんざい そんしつ そんぞく そんちょう ぞんび ぞんぶん そんみん たあい たいいん たいうん たいえき たいおう
だいがく たいき たいぐう たいけん たいこ たいざい だいじょうぶ だいすき たいせつ たいそう だいたい たいちょう たいてい だいどころ たいない たいねつ たいのう たいはん だいひょう たいふう たいへん たいほ たいまつばな
たいみんぐ たいむ たいめん たいやき たいよう たいら たいりょく たいる たいわん たうえ たえる たおす たおる たおれる たかい たかね たきび たくさん たこく たこやき たさい たしざん だじゃれ たすける たずさわる
たそがれ たたかう たたく ただしい たたみ たちばな だっかい だっきゃく だっこ だっしゅつ だったい たてる たとえる たなばた たにん たぬき たのしみ たはつ たぶん たべる たぼう たまご たまる だむる ためいき ためす
ためる たもつ たやすい たよる たらす たりきほんがん たりょう たりる たると たれる たれんと たろっと たわむれる だんあつ たんい たんおん たんか たんき たんけん たんご たんさん たんじょうび だんせい たんそく
たんたい だんち たんてい たんとう だんな たんにん だんねつ たんのう たんぴん だんぼう たんまつ たんめい だんれつ だんろ だんわ ちあい ちあん ちいき ちいさい ちえん ちかい ちから ちきゅう ちきん ちけいず ちけん
ちこく ちさい ちしき ちしりょう ちせい ちそう ちたい ちたん ちちおや ちつじょ ちてき ちてん ちぬき ちぬり ちのう ちひょう ちへいせん ちほう ちまた ちみつ ちみどろ ちめいど ちゃんこなべ ちゅうい ちゆりょく
ちょうし ちょさくけん ちらし ちらみ ちりがみ ちりょう ちるど ちわわ ちんたい ちんもく ついか ついたち つうか つうじょう つうはん つうわ つかう つかれる つくね つくる つけね つける つごう つたえる つづく つつじ
つつむ つとめる つながる つなみ つねづね つのる つぶす つまらない つまる つみき つめたい つもり つもる つよい つるぼ つるみく つわもの つわり てあし てあて てあみ ていおん ていか ていき ていけい ていこく
ていさつ ていし ていせい ていたい ていど ていねい ていひょう ていへん ていぼう てうち ておくれ てきとう てくび でこぼこ てさぎょう てさげ てすり てそう てちがい てちょう てつがく てつづき でっぱ てつぼう てつや
でぬかえ てぬき てぬぐい てのひら てはい てぶくろ てふだ てほどき てほん てまえ てまきずし てみじか てみやげ てらす てれび てわけ てわたし でんあつ てんいん てんかい てんき てんぐ てんけん てんごく てんさい
てんし てんすう でんち てんてき てんとう てんない てんぷら てんぼうだい てんめつ てんらんかい でんりょく でんわ どあい といれ どうかん とうきゅう どうぐ とうし とうむぎ とおい とおか とおく とおす とおる とかい
とかす ときおり ときどき とくい とくしゅう とくてん とくに とくべつ とけい とける とこや とさか としょかん とそう とたん とちゅう とっきゅう とっくん とつぜん とつにゅう とどける ととのえる とない となえる となり
とのさま とばす どぶがわ とほう とまる とめる ともだち ともる どようび とらえる とんかつ どんぶり ないかく ないこう ないしょ ないす ないせん ないそう なおす ながい なくす なげる なこうど なさけ なたでここ
なっとう なつやすみ ななおし なにごと なにもの なにわ なのか なふだ なまいき なまえ なまみ なみだ なめらか なめる なやむ ならう ならび ならぶ なれる なわとび なわばり にあう にいがた にうけ におい にかい にがて
にきび にくしみ にくまん にげる にさんかたんそ にしき にせもの にちじょう にちようび にっか にっき にっけい にっこう にっさん にっしょく にっすう にっせき にってい になう にほん にまめ にもつ にやり にゅういん
にりんしゃ にわとり にんい にんか にんき にんげん にんしき にんずう にんそう にんたい にんち にんてい にんにく にんぷ にんまり にんむ にんめい にんよう ぬいくぎ ぬかす ぬぐいとる ぬぐう ぬくもり ぬすむ ぬまえび
ぬめり ぬらす ぬんちゃく ねあげ ねいき ねいる ねいろ ねぐせ ねくたい ねくら ねこぜ ねこむ ねさげ ねすごす ねそべる ねだん ねつい ねっしん ねつぞう ねったいぎょ ねぶそく ねふだ ねぼう ねほりはほり ねまき ねまわし
ねみみ ねむい ねむたい ねもと ねらう ねわざ ねんいり ねんおし ねんかん ねんきん ねんぐ ねんざ ねんし ねんちゃく ねんど ねんぴ ねんぶつ ねんまつ ねんりょう ねんれい のいず のおづま のがす のきなみ のこぎり のこす
のこる のせる のぞく のぞむ のたまう のちほど のっく のばす のはら のべる のぼる のみもの のやま のらいぬ のらねこ のりもの のりゆき のれん のんき ばあい はあく ばあさん ばいか ばいく はいけん はいご はいしん
はいすい はいせん はいそう はいち ばいばい はいれつ はえる はおる はかい ばかり はかる はくしゅ はけん はこぶ はさみ はさん はしご ばしょ はしる はせる ぱそこん はそん はたん はちみつ はつおん はっかく はづき
はっきり はっくつ はっけん はっこう はっさん はっしん はったつ はっちゅう はってん はっぴょう はっぽう はなす はなび はにかむ はぶらし はみがき はむかう はめつ はやい はやし はらう はろうぃん はわい はんい
はんえい はんおん はんかく はんきょう ばんぐみ はんこ はんしゃ はんすう はんだん ぱんち ぱんつ はんてい はんとし はんのう はんぱ はんぶん はんぺん はんぼうき はんめい はんらん はんろん ひいき ひうん ひえる ひかく
ひかり ひかる ひかん ひくい ひけつ ひこうき ひこく ひさい ひさしぶり ひさん びじゅつかん ひしょ`.split(/\s+/),`的 一 是 在 不 了 有 和 人 这 中 大 为 上 个 国 我 以 要 他 时 来 用 们 生 到 作 地 于 出 就 分 对 成 会 可 主 发 年 动 同 工 也 能 下 过 子 说 产 种 面 而 方 后 多 定 行 学 法
所 民 得 经 十 三 之 进 着 等 部 度 家 电 力 里 如 水 化 高 自 二 理 起 小 物 现 实 加 量 都 两 体 制 机 当 使 点 从 业 本 去 把 性 好 应 开 它 合 还 因 由 其 些 然 前 外 天 政
四 日 那 社 义 事 平 形 相 全 表 间 样 与 关 各 重 新 线 内 数 正 心 反 你 明 看 原 又 么 利 比 或 但 质 气 第 向 道 命 此 变 条 只 没 结 解 问 意 建 月 公 无 系 军 很 情 者 最
立 代 想 已 通 并 提 直 题 党 程 展 五 果 料 象 员 革 位 入 常 文 总 次 品 式 活 设 及 管 特 件 长 求 老 头 基 资 边 流 路 级 少 图 山 统 接 知 较 将 组 见 计 别 她 手 角 期 根
论 运 农 指 几 九 区 强 放 决 西 被 干 做 必 战 先 回 则 任 取 据 处 队 南 给 色 光 门 即 保 治 北 造 百 规 热 领 七 海 口 东 导 器 压 志 世 金 增 争 济 阶 油 思 术 极 交 受 联
什 认 六 共 权 收 证 改 清 美 再 采 转 更 单 风 切 打 白 教 速 花 带 安 场 身 车 例 真 务 具 万 每 目 至 达 走 积 示 议 声 报 斗 完 类 八 离 华 名 确 才 科 张 信 马 节 话 米 整
空 元 况 今 集 温 传 土 许 步 群 广 石 记 需 段 研 界 拉 林 律 叫 且 究 观 越 织 装 影 算 低 持 音 众 书 布 复 容 儿 须 际 商 非 验 连 断 深 难 近 矿 千 周 委 素 技 备 半 办 青
省 列 习 响 约 支 般 史 感 劳 便 团 往 酸 历 市 克 何 除 消 构 府 称 太 准 精 值 号 率 族 维 划 选 标 写 存 候 毛 亲 快 效 斯 院 查 江 型 眼 王 按 格 养 易 置 派 层 片 始 却 专
状 育 厂 京 识 适 属 圆 包 火 住 调 满 县 局 照 参 红 细 引 听 该 铁 价 严 首 底 液 官 德 随 病 苏 失 尔 死 讲 配 女 黄 推 显 谈 罪 神 艺 呢 席 含 企 望 密 批 营 项 防 举 球 英
氧 势 告 李 台 落 木 帮 轮 破 亚 师 围 注 远 字 材 排 供 河 态 封 另 施 减 树 溶 怎 止 案 言 士 均 武 固 叶 鱼 波 视 仅 费 紧 爱 左 章 早 朝 害 续 轻 服 试 食 充 兵 源 判 护 司
足 某 练 差 致 板 田 降 黑 犯 负 击 范 继 兴 似 余 坚 曲 输 修 故 城 夫 够 送 笔 船 占 右 财 吃 富 春 职 觉 汉 画 功 巴 跟 虽 杂 飞 检 吸 助 升 阳 互 初 创 抗 考 投 坏 策 古 径
换 未 跑 留 钢 曾 端 责 站 简 述 钱 副 尽 帝 射 草 冲 承 独 令 限 阿 宣 环 双 请 超 微 让 控 州 良 轴 找 否 纪 益 依 优 顶 础 载 倒 房 突 坐 粉 敌 略 客 袁 冷 胜 绝 析 块 剂 测
丝 协 诉 念 陈 仍 罗 盐 友 洋 错 苦 夜 刑 移 频 逐 靠 混 母 短 皮 终 聚 汽 村 云 哪 既 距 卫 停 烈 央 察 烧 迅 境 若 印 洲 刻 括 激 孔 搞 甚 室 待 核 校 散 侵 吧 甲 游 久 菜 味
旧 模 湖 货 损 预 阻 毫 普 稳 乙 妈 植 息 扩 银 语 挥 酒 守 拿 序 纸 医 缺 雨 吗 针 刘 啊 急 唱 误 训 愿 审 附 获 茶 鲜 粮 斤 孩 脱 硫 肥 善 龙 演 父 渐 血 欢 械 掌 歌 沙 刚 攻
谓 盾 讨 晚 粒 乱 燃 矛 乎 杀 药 宁 鲁 贵 钟 煤 读 班 伯 香 介 迫 句 丰 培 握 兰 担 弦 蛋 沉 假 穿 执 答 乐 谁 顺 烟 缩 征 脸 喜 松 脚 困 异 免 背 星 福 买 染 井 概 慢 怕 磁 倍
祖 皇 促 静 补 评 翻 肉 践 尼 衣 宽 扬 棉 希 伤 操 垂 秋 宜 氢 套 督 振 架 亮 末 宪 庆 编 牛 触 映 雷 销 诗 座 居 抓 裂 胞 呼 娘 景 威 绿 晶 厚 盟 衡 鸡 孙 延 危 胶 屋 乡 临 陆
顾 掉 呀 灯 岁 措 束 耐 剧 玉 赵 跳 哥 季 课 凯 胡 额 款 绍 卷 齐 伟 蒸 殖 永 宗 苗 川 炉 岩 弱 零 杨 奏 沿 露 杆 探 滑 镇 饭 浓 航 怀 赶 库 夺 伊 灵 税 途 灭 赛 归 召 鼓 播 盘
裁 险 康 唯 录 菌 纯 借 糖 盖 横 符 私 努 堂 域 枪 润 幅 哈 竟 熟 虫 泽 脑 壤 碳 欧 遍 侧 寨 敢 彻 虑 斜 薄 庭 纳 弹 饲 伸 折 麦 湿 暗 荷 瓦 塞 床 筑 恶 户 访 塔 奇 透 梁 刀 旋
迹 卡 氯 遇 份 毒 泥 退 洗 摆 灰 彩 卖 耗 夏 择 忙 铜 献 硬 予 繁 圈 雪 函 亦 抽 篇 阵 阴 丁 尺 追 堆 雄 迎 泛 爸 楼 避 谋 吨 野 猪 旗 累 偏 典 馆 索 秦 脂 潮 爷 豆 忽 托 惊 塑
遗 愈 朱 替 纤 粗 倾 尚 痛 楚 谢 奋 购 磨 君 池 旁 碎 骨 监 捕 弟 暴 割 贯 殊 释 词 亡 壁 顿 宝 午 尘 闻 揭 炮 残 冬 桥 妇 警 综 招 吴 付 浮 遭 徐 您 摇 谷 赞 箱 隔 订 男 吹 园
纷 唐 败 宋 玻 巨 耕 坦 荣 闭 湾 键 凡 驻 锅 救 恩 剥 凝 碱 齿 截 炼 麻 纺 禁 废 盛 版 缓 净 睛 昌 婚 涉 筒 嘴 插 岸 朗 庄 街 藏 姑 贸 腐 奴 啦 惯 乘 伙 恢 匀 纱 扎 辩 耳 彪 臣
亿 璃 抵 脉 秀 萨 俄 网 舞 店 喷 纵 寸 汗 挂 洪 贺 闪 柬 爆 烯 津 稻 墙 软 勇 像 滚 厘 蒙 芳 肯 坡 柱 荡 腿 仪 旅 尾 轧 冰 贡 登 黎 削 钻 勒 逃 障 氨 郭 峰 币 港 伏 轨 亩 毕 擦
莫 刺 浪 秘 援 株 健 售 股 岛 甘 泡 睡 童 铸 汤 阀 休 汇 舍 牧 绕 炸 哲 磷 绩 朋 淡 尖 启 陷 柴 呈 徒 颜 泪 稍 忘 泵 蓝 拖 洞 授 镜 辛 壮 锋 贫 虚 弯 摩 泰 幼 廷 尊 窗 纲 弄 隶
疑 氏 宫 姐 震 瑞 怪 尤 琴 循 描 膜 违 夹 腰 缘 珠 穷 森 枝 竹 沟 催 绳 忆 邦 剩 幸 浆 栏 拥 牙 贮 礼 滤 钠 纹 罢 拍 咱 喊 袖 埃 勤 罚 焦 潜 伍 墨 欲 缝 姓 刊 饱 仿 奖 铝 鬼 丽
跨 默 挖 链 扫 喝 袋 炭 污 幕 诸 弧 励 梅 奶 洁 灾 舟 鉴 苯 讼 抱 毁 懂 寒 智 埔 寄 届 跃 渡 挑 丹 艰 贝 碰 拔 爹 戴 码 梦 芽 熔 赤 渔 哭 敬 颗 奔 铅 仲 虎 稀 妹 乏 珍 申 桌 遵
允 隆 螺 仓 魏 锐 晓 氮 兼 隐 碍 赫 拨 忠 肃 缸 牵 抢 博 巧 壳 兄 杜 讯 诚 碧 祥 柯 页 巡 矩 悲 灌 龄 伦 票 寻 桂 铺 圣 恐 恰 郑 趣 抬 荒 腾 贴 柔 滴 猛 阔 辆 妻 填 撤 储 签 闹
扰 紫 砂 递 戏 吊 陶 伐 喂 疗 瓶 婆 抚 臂 摸 忍 虾 蜡 邻 胸 巩 挤 偶 弃 槽 劲 乳 邓 吉 仁 烂 砖 租 乌 舰 伴 瓜 浅 丙 暂 燥 橡 柳 迷 暖 牌 秧 胆 详 簧 踏 瓷 谱 呆 宾 糊 洛 辉 愤
竞 隙 怒 粘 乃 绪 肩 籍 敏 涂 熙 皆 侦 悬 掘 享 纠 醒 狂 锁 淀 恨 牲 霸 爬 赏 逆 玩 陵 祝 秒 浙 貌`.split(/\s+/),ge([We],[[Ge,4]]),window.PropertySecretGuard=Object.freeze({findSecret:je})})();