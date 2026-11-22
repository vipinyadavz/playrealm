/* Word Bomb: type a word containing the letters on the bomb before it goes off.
   Solo: a draining time bank, refilled by every word (longer words refill more).
   Pass the bomb: 2-4 players share one keyboard; a hidden fuse decides who loses a life. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 960;
  const H = 600;
  const TAU = Math.PI * 2;
  const INK = '#0B0B1A';
  const F_TITLE = (s) => '800 ' + s + 'px Unbounded, sans-serif';
  const F_LABEL = (s) => '600 ' + s + 'px "JetBrains Mono", monospace';
  const F_BODY = (s, w) => (w || 600) + ' ' + s + 'px Figtree, sans-serif';
  const SEAT_COLORS = [C.p1, C.p2, C.gold, C.mint];
  const FULL_URL = 'https://cdn.jsdelivr.net/npm/an-array-of-english-words@2.0.0/index.json';
  const BANK_START = 15;
  const BANK_MAX = 30;
  const SKIP_COST = 3;
  const LIVES = 3;
  const LONG_WORD = 8;

  /* Fallback dictionary: common English words plus their regular plural and verb forms. */
  const FALLBACK =
    'ability able abled ables abling about abouts above aboves absent absented absenting absents absorb absorbed ' +
    'absorbing absorbs accent accented accenting accents accept accepted accepting accepts accident accidented ' +
    'accidents account accounted accounting accounts ache ached aches aching acid acids acorn acorned acorns acrobat ' +
    'acrobats across act acted acting action actioned actioning actions active actives activity actor actors acts ' +
    'actual actuals adapt adapted adapting adapts add added adding address addressed addresses addressing adds admire ' +
    'admired admires admiring admit admits admitted admitting adopt adopted adopting adopts adult adults adventure ' +
    'adventured adventures adventuring advice advices afford afforded affording affords afraid after afternoon ' +
    'afternoons afters again against age aged ageing agent agented agenting agents ages aging agree agreed agreeing ' +
    'agrees ahead aim aimed aiming aims air aired airing airplane airplanes airport airports airs alarm alarmed ' +
    'alarming alarms album albums alert alerted alerting alerts alien aliened aliening aliens alike alive all alley ' +
    'alleyed alleys allow allowed allowing allows alls almost alone along aloud alphabet alphabeted alphabeting ' +
    'alphabets already also although always amaze amazed amazes amazing ambulance ambulances among amount amounted ' +
    'amounting amounts amuse amused amuses amusing ancestor ancestored ancestoring ancestors anchor anchored ' +
    'anchoring anchors ancient ancients and ands angel angeled angeling angels anger angered angering angers angle ' +
    'angled angles angling angrily angry animal animals ankle ankled ankles ankling announce announced announces ' +
    'announcing annoy annoyed annoying annoys annual annuals another answer answered answering answers ant anted ' +
    'anting ants anxious anybody anyone anyones anything anythings anyway anyways anywhere anywheres apart apology ' +
    'appear appeared appearing appears appetite appetites applaud applauded applauding applauds apple apples approach ' +
    'approached approaches approaching apricot apricots apron aproned aproning aprons aquarium aquariums arch arched ' +
    'arches arching are area areas ared arena arenas ares argue argued argues arguing arm armchair armchairs armed ' +
    'arming arms army around arrange arranged arranges arranging arrest arrested arresting arrests arrive arrived ' +
    'arrives arriving arrow arrowed arrowing arrows art article articled articles articling artist artists arts ask ' +
    'asked asking asks asleep astronaut astronauts ate ates athlete athletes atlas atlases attach attached attaches ' +
    'attaching attack attacked attacking attacks attempt attempted attempting attempts attend attended attending ' +
    'attends attention attentions attic attics attract attracted attracting attracts audience audiences aunt aunts ' +
    'author authored authoring authors autumn autumns available avenue avenues average averaged averages averaging ' +
    'avoid avoided avoiding avoids awake awaked awakes awaking award awarded awarding awards away aways awesome awful ' +
    'babied baby babying back backed backing backpack backpacked backpacking backpacks backs backward backwards ' +
    'backyard backyards bacon bacons bad badge badged badges badging badly bads bag bagged bagging bags bake baked ' +
    'baker bakers bakes baking balance balanced balances balancing balconied balcony ball balled balling balloon ' +
    'ballooned ballooning balloons balls bamboo bamboos banana bananas band bandage bandaged bandages bandaging ' +
    'banded banding bands bang banged banging bangs bank banked banking banks banner bannered bannering banners bar ' +
    'barber barbered barbering barbers bare bared bares bargain bargained bargaining bargains baring bark barked ' +
    'barking barks barn barned barning barns barred barrel barreled barreling barrels barring bars base based ' +
    'basement basements bases basic basics basing basket basketball basketballs baskets bat bated bath bathed bathing ' +
    'bathroom bathrooms baths bathtub bathtubs bating bats batted batter battered battering batters battery batting ' +
    'battle battled battles battling beach beached beaches beaching bead beaded beading beads beak beaked beaks beam ' +
    'beamed beaming beams bean beaned beaning beans bear beard bearded bearding beards beared bearing bears beat ' +
    'beating beats beautied beautiful beauty beautying because become becomes becoming bed bedded bedding bedroom ' +
    'bedroomed bedrooms beds bee beef beefed beefing beefs been bees beetle beetled beetles beetling before beg began ' +
    'begged begging begin beginner beginners beginning begins begs begun behave behaved behaves behaving behavior ' +
    'behaviors behind behinds being beings believe believed believes believing bell belled bellied belling bells ' +
    'belly bellying belong belonged belonging belongs below belows belt belted belting belts bench benched benches ' +
    'benching bend bended bending bends beneath benefit benefited benefiting benefits bent bents berried berry ' +
    'berrying beside besides best bested besting bests better bettered bettering betters between betweens beyond ' +
    'beyonds bicycle bicycled bicycles bicycling big bigged bigging bigs bike biked bikes biking bill billed billing ' +
    'billion billions bills bind binding binds bird birded birding birds birth birthday birthdays birthed birthing ' +
    'births biscuit biscuits bit bite bites biting bits bitted bitten bitter bittered bittering bitters bitting black ' +
    'blacked blacking blacks blade bladed blades blading blame blamed blames blaming blank blanked blanket blanketed ' +
    'blanketing blankets blanking blanks blast blasted blasting blasts blaze blazed blazes blazing bleach bleached ' +
    'bleaches bleaching bled bleed bleeding bleeds blend blended blender blenders blending blends bless blessed ' +
    'blesses blessing blew blind blinded blinding blinds blink blinked blinking blinks blizzard blizzards block ' +
    'blocked blocking blocks blond blonding blonds blood blooded blooding bloods bloom bloomed blooming blooms ' +
    'blossom blossomed blossoming blossoms blow blowed blowing blown blows blue blueberry blued blueing blues bluing ' +
    'blush blushed blushes blushing board boarded boarding boards boast boasted boasting boasts boat boated boating ' +
    'boats bodied body bodying boil boiled boiling boils bold bolds bolt bolted bolting bolts bone boned bones boning ' +
    'bonus bonuses book booked booking books boot booted booting boots border bordered bordering borders bore bored ' +
    'borees bores boring borings born borrow borrowed borrowing borrows boss bossed bosses bossing both bother ' +
    'bothered bothering bothers bottle bottled bottles bottling bottom bottomed bottoming bottoms bought boughts ' +
    'boulder bouldered bouldering boulders bounce bounced bounces bouncing bound boundary bounded bounding bounds bow ' +
    'bowed bowing bowl bowled bowling bowls bows box boxed boxes boxing boy boyed boying boys bracelet bracelets ' +
    'brain brained braining brains brake braked brakes braking branch branched branches branching brand branded ' +
    'branding brands brave braved braves braving bread breaded breading breads break breakable breakables breakfast ' +
    'breakfasted breakfasting breakfasts breaking breaks breath breathe breathed breathes breathing breaths breeze ' +
    'breezed breezes breezing brick bricked bricking bricks bride brided brides bridge bridged bridges bridging ' +
    'briding brief briefed briefing briefs bright brightly brights brilliant brillianted brillianting brilliants ' +
    'bring bringing brings broad broadcast broadcasted broadcasting broadcasts broads broccoli broccolis broke broked ' +
    'broken brokes broking brook brooked brooking brooks broom broomed brooming brooms brother brothered brothering ' +
    'brothers brought brown browned brownie brownies browning browns brush brushed brushes brushing bubble bubbled ' +
    'bubbles bubbling bucket bucketed bucketing buckets buckle buckled buckles buckling bud budded buddied budding ' +
    'buddy buddying budget budgeted budgeting budgets buds buffalo buffaloed buffaloes buffaloing buffalos build ' +
    'builded building builds built bulb bulbed bulbing bulbs bulldozer bulldozers bump bumped bumping bumps bumpy ' +
    'bunch bunched bunches bunching bundle bundled bundles bundling bunny burger burgers buried burn burned burning ' +
    'burns burst bursted bursting bursts bury burying bus bused buses bush bushed bushes bushing busied business ' +
    'businesses busing buss bussed bussing busy busying butter buttered butterflied butterfly butterflying buttering ' +
    'butters button buttoned buttoning buttons buy buying buys buzz buzzed buzzes buzzing cabbage cabbaged cabbages ' +
    'cabbaging cabin cabined cabining cabins cable cabled cables cabling cactus cactuses cafe cafes cage caged cages ' +
    'caging cake caked cakes caking calculate calculated calculates calculating calendar calendared calendaring ' +
    'calendars calf calfs call called calling calls calm calmed calming calms camel camels camera cameras camp camped ' +
    'camping campings camps can canal canaled canaling canalled canalling canals candied candle candled candles ' +
    'candling candy candying cane caned canes caning canned canning cannon cannoned cannoning cannons canoe canoed ' +
    'canoeing canoes cans canyon canyoning canyons cap capable caped caping capital capitals capped capping caps ' +
    'captain captained captaining captains car caramel caramels card cardboard cardboards carded carding cards care ' +
    'cared careful carefully careless cares cargo cargoed cargoes cargoing cargos caring carnival carnivals carpenter ' +
    'carpentered carpentering carpenters carpet carpeted carpeting carpets carried carrot carrots carry carrying cars ' +
    'cart carted carting cartoon cartooned cartooning cartoons carts cartwheel cartwheeled cartwheeling cartwheels ' +
    'carve carved carves carving case cased cases cash cashed cashes cashier cashiered cashiering cashiers cashing ' +
    'casing castle castled castles castling cat catch catched catches catching caterpillar caterpillars cathedral ' +
    'cathedrals cats catted catting cattle caught cauliflower cauliflowers cause caused causes causing cave caved ' +
    'caves caving ceiling ceilinged ceilings celebrate celebrated celebrates celebrating celery cell cellar cellared ' +
    'cellaring cellars celled celling cells center centered centering centers century cereal cereals certain chain ' +
    'chained chaining chains chair chaired chairing chairs chalk chalked chalking chalks challenge challenged ' +
    'challenges challenging champion championed championing champions chance chanced chances chancing change changed ' +
    'changes changing channel channeled channeling channels chapter chaptered chaptering chapters character ' +
    'charactered charactering characters charcoal charcoaled charcoaling charcoals charge charged charges charging ' +
    'charm charmed charming charms chart charted charting charts chase chased chases chasing chat chats chatted ' +
    'chatting cheap cheaped cheaping cheaps check checked checking checks cheek cheeked cheeking cheeks cheer cheered ' +
    'cheerful cheering cheers cheese cheesed cheeses cheesing chef chefed cheffed cheffing chefing chefs chemical ' +
    'chemicals cherried cherry cherrying chess chesses chest chested chesting chests chew chewed chewing chews ' +
    'chicken chickened chickening chickens chief chiefs child childed childing childs chill chilled chilling chills ' +
    'chimney chimneyed chimneying chimneys chimpanzee chimpanzees chin chined chining chinned chinning chins chip ' +
    'chipmunk chipmunks chipped chipping chips chocolate chocolates choice choices choose chooses choosing chop ' +
    'chopped chopping chops chorus chorused choruses chorusing chose chosen choses church churched churches churching ' +
    'cinnamon cinnamons circle circled circles circling circus circuses citied citizen citizens city clap clapped ' +
    'clapping claps class classed classes classic classics classing classroom classrooms claw clawed clawing claws ' +
    'clay clayed claying clays clean cleaned cleaner cleaners cleaning cleans clear cleared clearing clearly clears ' +
    'clever cliff cliffed cliffs climate climated climates climating climb climbed climbing climbs cling clinged ' +
    'clinging clings clinic clinics clip cliped cliping clipped clipping clips clock clocked clocking clocks close ' +
    'closed closely closes closet closeted closeting closets closing cloth clothed clothes clothing clothings cloths ' +
    'cloud clouded clouding clouds clover clovered clovers clown clowned clowning clowns club clubbed clubbing clubs ' +
    'clue clued clueing clues cluing clung coach coached coaches coaching coal coaled coaling coals coast coasted ' +
    'coasting coasts coat coated coating coats coconut coconuts code coded codes coding coffee coffees coin coined ' +
    'coining coins cold colds collapse collapsed collapses collapsing collar collared collaring collars collect ' +
    'collected collecting collects college colleges color colored colorful coloring colors column columned columns ' +
    'comb combed combing combs come comes comfort comfortable comforted comforting comforts comic comics coming ' +
    'command commanded commanding commands comment commented commenting comments common commoned commoning commons ' +
    'community companied company companying compare compared compares comparing compass compassed compasses ' +
    'compassing complete completed completes completing compost composted composting composts computer computers ' +
    'concert concerted concerting concerts concrete concreted concretes concreting condition conditioned conditioning ' +
    'conditions confident confidents connect connected connecting connects consider considered considering considers ' +
    'contain contained containing contains contest contested contesting contests continent continents continue ' +
    'continued continues continuing control controls conversation conversations cook cooked cookie cookies cooking ' +
    'cooks cool cooled cooling cools copied copy copying coral corals corn corned corner cornered cornering corners ' +
    'corning corns correct corrected correcting corrects cost costed costing costs costume costumed costumes ' +
    'costuming cottage cottaged cottages cottaging cotton cottoned cottoning cottons couch couched couches couching ' +
    'cough coughed coughing coughs counselor counselors count counted counter countered countering counters counting ' +
    'country counts couple coupled couples coupling courage courages course coursed courses coursing courtyard ' +
    'courtyards cousin cousins cover covered covering covers cow cowboy cowboyed cowboying cowboys cowed cowing cows ' +
    'coyote coyotes crab crabbed crabbing crabs crack cracked cracker crackers cracking cracks cradle cradled cradles ' +
    'cradling craft crafted crafting crafts crash crashed crashes crashing crater cratered cratering craters crawl ' +
    'crawled crawling crawls crayon crayoned crayoning crayons crazy cream creamed creaming creams create created ' +
    'creates creating creature creatures credit credited crediting credits creek creeks creep creeped creeping creeps ' +
    'crept crew crewed crewing crews cricket cricketed cricketing crickets cried crime crimed crimes criming crisp ' +
    'crisped crisping crisps crocodile crocodiles crop cropped cropping crops cross crossed crosses crossing ' +
    'crossings crowd crowded crowding crowds crown crowned crowning crowns cruel cruels crumb crumbed crumbing crumbs ' +
    'crunch crunched crunches crunching crush crushed crushes crushing crust crusted crusting crusts cry crying ' +
    'crystal crystals cube cubed cubes cubing cucumber cucumbers culture cultured cultures culturing cup cupboard ' +
    'cupboarded cupboarding cupboards cupcake cupcakes cupped cupping cups cure cured cures curing curious curl ' +
    'curled curling curls current currents curtain curtained curtaining curtains curve curved curves curving cushion ' +
    'cushioned cushioning cushions custom customed customer customers customs cut cute cutes cuts cutting cycle ' +
    'cycled cycles cycling dad dadded dadding dads daily dairy dairying daisied daisy damage damaged damages damaging ' +
    'damp damped damping damps dance danced dances dancing dandelion dandelions danger dangered dangering dangerous ' +
    'dangers dare dared dares daring dark darked darking darkness darknesses darks dash dashed dashes dashing data ' +
    'date dated dates dating daughter daughters dawn dawned dawning dawns day daydream daydreamed daydreaming ' +
    'daydreams days dead deaded deading deads deal dealing deals dealt dear deared dearing dears debt debted debts ' +
    'decide decided decides deciding decimal decimals decision decisioned decisioning decisions deck decked decking ' +
    'decks decorate decorated decorates decorating deep deeply deeps deer deers defend defended defending defends ' +
    'degree degreed degrees delay delayed delaying delays delicate delicates delicious delight delighted delighting ' +
    'delights deliver delivered delivering delivers den denned denning dens dentist dentists department departments ' +
    'depend depended depending depends deposit deposited depositing deposits describe described describes describing ' +
    'desert deserted deserting deserts deserve deserved deserves deserving design designed designing designs desire ' +
    'desired desires desiring desk desking desks dessert desserts destroy destroyed destroying destroys detail ' +
    'detailed detailing details detective detectives develop developed developing develops diagram diagramed ' +
    'diagraming diagrams dial dialed dialing dials diamond diamonded diamonding diamonds diary dice diced dices ' +
    'dicing dictionary did die died dieing dies different difficult dig digged digging digital digitals digs dime ' +
    'dimes dinner dinnered dinnering dinners dinosaur dinosaurs dip dipped dipping dips direct directed directing ' +
    'direction directions directs dirt dirted dirtied dirting dirts dirty dirtying disagree disagreed disagreeing ' +
    'disagrees disappear disappeared disappearing disappears discover discovered discovering discovers discuss ' +
    'discussed discusses discussing disease diseased diseases diseasing disguise disguised disguises disguising dish ' +
    'dished dishes dishing display displayed displaying displays distance distanced distances distancing distant dive ' +
    'dived diver divers dives divide divided divides dividing diving dizzied dizzy dizzying doctor doctored doctoring ' +
    'doctors document documented documenting documents does dog dogged dogging dogs doing doings doll dollar dollared ' +
    'dollars dolled dolling dolls dolphin dolphins done donees doning donkey donkeys door doorbell doorbells doors ' +
    'dot doted doting dots dotted dotting double doubled doubles doubling doubt doubted doubting doubts dough doughs ' +
    'down downed downhill downhills downing downs downstairs downstairses dozen dozened dozening dozens dragon ' +
    'dragonfly dragons drain drained draining drains drama dramas drank draw drawer drawers drawing drawings drawn ' +
    'draws dream dreamed dreaming dreams dreamt dress dressed dresses dressing drew dried drift drifted drifting ' +
    'drifts drill drilled drilling drills drink drinking drinks drip dripped dripping drips drive driven drives ' +
    'driveway driveways driving drizzle drizzled drizzles drizzling drop dropped dropping drops drought droughts ' +
    'drove droved droves droving drum drummed drumming drums dry dryer dryers drying drys duck ducked ducking ' +
    'duckling ducklings ducks dug dugs dull dulled dulling dulls dumpling dumplings dungeon dungeoned dungeoning ' +
    'dungeons during dust dusted dusting dusts dutied duty each eager eagers eagle eagled eagles eagling ear eared ' +
    'earing early earn earned earning earns earring earringed earrings ears earth earthed earthing earthquake ' +
    'earthquaked earthquakes earthquaking earths easel easeled easels easied easily east easted easting easts easy ' +
    'easying eat eaten eating eats echo echoed echoes echoing echos edge edged edges edging edible edibles effect ' +
    'effected effecting effects effort efforts egg egged egging eggs eight eights either elastic elastics elbow ' +
    'elbowed elbowing elbows election elections electric electrics elephant elephants elevator elevators else emerald ' +
    'emeralds emergency emotion emotions employ employed employing employs emptied empty emptying encourage ' +
    'encouraged encourages encouraging end ended ending endless ends enemy energy engine engined engines engining ' +
    'enjoy enjoyable enjoyed enjoying enjoys enormous enough enoughs enter entered entering enters entire entires ' +
    'entrance entranced entrances entrancing envelope enveloped envelopes enveloping equal equaled equaling equals ' +
    'equipment equipments eraser erasers errand errands eruption eruptions escape escaped escapees escapes escaping ' +
    'even evened evening evenings evens event evented eventing events ever every everybody everyone everything ' +
    'everywhere evidence evidenced evidences evidencing exact exacted exacting exactly exacts exam example exampled ' +
    'examples exampling exams excellent except excepted excepting excepts excite excited excites exciting exercise ' +
    'exercised exercises exercising exhibit exhibited exhibiting exhibits exist existed existing exists exit exited ' +
    'exiting exits expect expected expecting expects expensive expert experted experting experts explain explained ' +
    'explaining explains explore explored explores exploring explosion explosions express expressed expresses ' +
    'expressing extra extras eye eyed eyeing eyes eying fabric fabrics face faced faces facing fact factory facts ' +
    'fail failed failing fails faint fainted fainting faints fair faired fairing fairs fairy faith faithed faithing ' +
    'faiths fall fallen falling falls false falsed falses falsing family famous famoused famouses famousing fan ' +
    'fancied fancy fancying fanned fanning fans far faraway faraways fared faring farm farmed farmer farmers farming ' +
    'farms farred farring fars fashion fashioned fashioning fashions fast fasted fasting fasts fat fated father ' +
    'fathered fathering fathers fating fats fatted fatting fault faulted faulting faults favor favored favoring ' +
    'favorite favorites favors fear feared fearing fears feast feasted feasting feasts feather feathered feathering ' +
    'feathers feature featured features featuring fed feds feed feeding feeds feel feeling feels fell felled felling ' +
    'fellow fellowed fellowing fellows fells felt felted felting felts fence fenced fences fencing festival festivals ' +
    'fever fevered fevering fevers few fews fiction fictions fiddle fiddled fiddles fiddling field fielded fielding ' +
    'fields fierce fifteen fifteens fifty fight fighting fights figure figured figures figuring fill filled filling ' +
    'fills film filmed filming films final finally finals find finding finds fine fined fines finger fingered ' +
    'fingering fingers fining finish finished finishes finishing fire fired firefly fireplace fireplaced fireplaces ' +
    'fires firework fireworks firing first firsts fish fished fisherman fishes fishing fist fisted fisting fists fit ' +
    'fitness fitnesses fits fitted fitting five fives fix fixed fixes fixing flag flagged flagging flags flame flamed ' +
    'flames flaming flamingo flamingoes flamingos flap flapped flapping flaps flash flashed flashes flashing ' +
    'flashlight flashlights flat flats flatted flatting flavor flavored flavoring flavors fled flee fleeing flees ' +
    'flew flewed flews flexible flied flight flighted flighting flights fling flinging flings flipper flippers float ' +
    'floated floating floats flock flocked flocking flocks flood flooded flooding floods floor floored flooring ' +
    'floors flour floured flouring flours flow flowed flower flowered flowering flowers flowing flown flows flung ' +
    'flute fluted flutes fluting flutter fluttered fluttering flutters fly flying fog fogged fogging fogs fold folded ' +
    'folder folders folding folds folk folks follow followed following follows fond fonded fonding fonds food foods ' +
    'fool fooled fooling fools foot football footballing footballs footed footing footprint footprints foots force ' +
    'forced forces forcing forecast forecasted forecasting forecasts foreign forest forested foresting forests ' +
    'forever forevers forget forgets forgive forgives forgiving forgot forgotten fork forked forking forks form ' +
    'formed forming forms fort forted forting forts fortune fortuned fortunes fortuning forty forward forwarded ' +
    'forwarding forwards fossil fossils fought found founded founding founds fountain fountained fountaining ' +
    'fountains four fours fox foxed foxes foxing fraction fractioned fractioning fractions frame framed frames ' +
    'framing free freed freedom freedoms freeing freely frees freeze freezer freezers freezes freezing frequent ' +
    'frequented frequenting frequents fresh freshed freshes freshing fried friend friended friending friendly friends ' +
    'frighten frightened frightening frightens frisbee frisbees frog frogged frogging frogs from front fronted ' +
    'fronting fronts frost frosted frosting frostings frosts frown frowned frowning frowns froze frozen fruit fruited ' +
    'fruiting fruits fry frying fuel fueled fueling fuels full fulled fulling fulls fully fun funned funnel funneled ' +
    'funneling funnels funning funny funs fur furious furniture furnitures furred furring furs future futures gain ' +
    'gained gaining gains galaxy galleried gallery gallerying gallon gallons game gamed games gaming garage garaged ' +
    'garages garaging garbage garbages garden gardened gardener gardeners gardening gardens garlic garlics gas gases ' +
    'gasoline gasolines gassed gassing gate gated gates gather gathered gathering gathers gating gave general ' +
    'generals generous genius geniuses gentle gentled gentleman gentles gentling gently geography gerbil gerbils ' +
    'gesture gestured gestures gesturing get gets getting ghost ghosted ghosting ghosts giant giants gift gifted ' +
    'gifting gifts giggle giggled giggles giggling ginger gingered gingering gingers giraffe giraffes girl girls give ' +
    'gived given givens gives giving glacier glaciered glaciers glad gladded gladding glads glance glanced glances ' +
    'glancing glass glassed glasses glassing glide glided glides gliding glitter glittered glittering glitters global ' +
    'globe globed globes globing glove gloved gloves gloving glow glowed glowing glows glue glued glueing glues ' +
    'gluing goal goaled goaling goals goat goats goblin goblins goggles gold golden goldened goldening goldens golds ' +
    'gone good goods goose goosed gooses goosing gorilla gorillas gossip gossiped gossiping gossips got govern ' +
    'governed governing governs grab grabbed grabbing grabs grade graded grades grading grain grained graining grains ' +
    'grammar grammars grand grandfather grandfathered grandfathering grandfathers grandmother grandmothers grands ' +
    'grape graped grapefruit grapefruits grapes graping grass grassed grasses grasshopper grasshoppers grassing ' +
    'grateful gravel graveled graveling gravels gravity gray grayed graying grays great greats greedy green greened ' +
    'greenhouse greenhouses greening greens greet greeted greeting greets grew grewed grewing grews grin grind ' +
    'grinded grinding grinds grinned grinning grins grip griped griping gripped gripping grips groan groaned groaning ' +
    'groans grocery ground grounded grounding grounds group grouped grouping groups grow growing growl growled ' +
    'growling growls grown grows grumpy guard guarded guardian guardians guarding guards guess guessed guesses ' +
    'guessing guest guested guesting guests guide guided guides guiding guinea guineas guitar guitars gum gummed ' +
    'gumming gums gymnast gymnasts habit habitat habitats habited habiting habits had hadding haded hading hads hair ' +
    'hairbrush hairbrushes haired hairing hairs half halfs halfway hall halling halls hallway hallways hamburger ' +
    'hamburgers hammer hammered hammering hammers hammock hammocks hamster hamsters hand handed handing handle ' +
    'handled handles handling hands handsome handsomes handwriting handwritings hang hanged hanging hangs happen ' +
    'happened happening happens happied happily happiness happinesses happy happying harbor harbored harboring ' +
    'harbors hard hardly hards hardware hardwares harm harmed harming harmony harms harvest harvested harvesting ' +
    'harvests has hass hat hatch hatched hatches hatching hate hated hates hating hats hatted hatting haunted have ' +
    'haves having havings hawk hawked hawking hawks hay hayed haying hays head headache headaches headband headbands ' +
    'headed heading heads heal healed healing heals health healths healthy heap heaped heaping heaps hear hearing ' +
    'hears heart heartbeat heartbeats hearted hearting hearts heat heated heater heaters heating heats heavy hedge ' +
    'hedged hedgehog hedgehogs hedges hedging heel heeled heeling heels height heights held helicopter helicoptered ' +
    'helicoptering helicopters hello helloed helloes helloing hellos helmet helmeted helmeting helmets help helped ' +
    'helpful helping helps hen henned henning hens her herd herded herding herds here heres hero heroes heros herring ' +
    'hers hexagon hexagons hibernate hibernated hibernates hibernating hid hidden hide hided hides hiding high highed ' +
    'highing highly highs highway highways hike hiked hikes hiking hill hilled hilling hills him hims hint hinted ' +
    'hinting hints hip hipped hipping hippo hippos hips hire hired hirees hires hiring his hiss hissed hissing ' +
    'historied history historying hit hits hitting hobby hockey hockeys hold holding holds hole holed holes holiday ' +
    'holidayed holidaying holidays holing hollow hollowed hollowing hollows home homed homes homework homeworking ' +
    'homeworks homing honest honey honeybee honeybees honeyed honeying honeys hood hooded hooding hoods hook hooked ' +
    'hooking hooks hop hope hoped hopes hoping hopped hopping hops horizon horizons horn horned horning horns ' +
    'horrible horribles horse horsed horses horsing hose hosed hoses hosing hospital hospitals hot hotel hoteling ' +
    'hotelling hotels hots hotted hotting hour hours house housed houses housing how however hows hug huge hugged ' +
    'hugging hugs human humans humble humbled humbles humbling hummingbird hummingbirds humor humored humoring humors ' +
    'hundred hundreds hung hunger hungered hungering hungers hungry hunt hunted hunting hunts hurricane hurricanes ' +
    'hurried hurry hurrying hurt hurting hurts husband husbanded husbanding husbands hut huts hutted hutting ice ' +
    'iceberg icebergs iced ices icicle icicled icicles icing idea ideaed ideas identified identify identifying igloo ' +
    'igloos ignore ignored ignores ignoring ill illness illnesses ills imagination imaginations imagine imagined ' +
    'imagines imagining impact impacted impacting impacts important impossible impossibles improve improved improves ' +
    'improving inch inched inches inching include included includes including increase increased increases increasing ' +
    'incredible indeed indoor indoors infant infants information informations injury ink inked inking inks innocent ' +
    'innocents insect insects inside insides insist insisted insisting insists inspect inspected inspecting inspects ' +
    'instant instants instead instructor instructors instrument instrumented instrumenting instruments insult ' +
    'insulted insulting insults interest interested interesting interests into intoed invent invented inventing ' +
    'invents invisible invisibles invitation invitations invite invited invitees invites inviting iron ironed ironing ' +
    'irons island islanded islanding islands issue issued issues issuing itch itched itches itching item itemed ' +
    'iteming items its jacket jacketed jacketing jackets jaguar jaguars jam jammed jamming jams jar jarred jarring ' +
    'jars jaw jawed jawing jaws jealous jealoused jealouses jealousing jeans jellied jelly jellyfish jellyfishes ' +
    'jellying jewel jeweled jeweling jewelled jewelling jewels jigsaw jigsawed jigsawing jigsaws job jobbed jobbing ' +
    'jobed jobing jobs jogging joggings join joined joining joins joke joked jokes joking journal journaled ' +
    'journaling journals journey journeyed journeying journeys joy joyed joying joys judge judged judges judging ' +
    'juggle juggled juggles juggling juice juiced juices juicing juicy jump jumped jumping jumps jumpy jungle jungled ' +
    'jungles junior juniors just justed justing justs kangaroo kangarooed kangarooing kangaroos kayak kayaked ' +
    'kayaking kayaks keep keeping keeps kept ketchup ketchups kettle kettles key keyboard keyboarded keyboarding ' +
    'keyboards keyed keying keys kick kicked kicking kicks kid kidded kidding kids kind kinded kinding kindly ' +
    'kindness kindnesses kinds king kingdom kingdomed kingdoms kinged kinging kings kiss kissed kisses kissing ' +
    'kitchen kitchened kitchening kitchens kite kited kites kiting kitten kittened kittening kittens knapsack ' +
    'knapsacked knapsacks knee kneed kneeing kneel kneeled kneeling kneels knees knelt knew knife knifed knifes ' +
    'knifing knight knighted knighting knights knit knits knitted knitting knock knocked knocking knocks knot knots ' +
    'knotted knotting know knowing knowledge knowledged knowledges knowledging known knowns knows koala koalas label ' +
    'labeled labeling labelled labelling labels laboratory lace laced laces lacing ladder laddered laddering ladders ' +
    'lady ladybug ladybugs lake laked lakes laking lamb lambed lambing lambs lamp lamped lamping lamps land landed ' +
    'landing lands lane lanes language languaged languages languaging lantern lanterned lanterning lanterns lap ' +
    'lapped lapping laps laptop laptops large larges last lasted lasting lasts late lated lately later laugh laughed ' +
    'laughing laughs launch launched launches launching laundry lawn lawned lawns lawyer lawyered lawyering lawyers ' +
    'lay layed layer layered layering layers laying lays lazied lazy lazying lead leaded leader leaders leading leads ' +
    'leaf leafed leafing leafs lean leaned leaning leans learn learned learning learns leash leashed leashes leashing ' +
    'least leasts leather leathered leathering leathers leave leaved leaves leaving led left lefts leg legged legging ' +
    'legs lemon lemonade lemonades lemoned lemoning lemons lend lending lends length lengths lent leopard leopards ' +
    'less lesses lesson lessoned lessoning lessons let lets letted letter lettered lettering letters letting lettuce ' +
    'lettuces level leveled leveling levelled levelling levels liberty librarian librarians library lick licked ' +
    'licking licks lid lidded lidding lids lie lied lies life lifeguard lifeguarded lifeguarding lifeguards lifes ' +
    'lifetime lifetimes lift lifted lifting lifts light lighted lighthouse lighthouses lighting lightlied lightly ' +
    'lightlying lightning lightninged lightnings lights like liked likely likes liking limb limbed limbing limbs ' +
    'limit limited limiting limits limousine limousines line lined lines lining lion lions lip lipped lipping lips ' +
    'lipstick lipsticked lipsticking lipsticks liquid liquids list listed listen listened listening listens listing ' +
    'lists lit lited literature literatured literatures liting lits little littles littling live lived lives living ' +
    'lizard lizards load loaded loading loads loaf loafed loafing loafs lobster lobstered lobstering lobsters local ' +
    'locals lock locked locker lockers locking locks log logged logging logs lollipop lollipops lonely long longed ' +
    'longing longs look looked looking looks loop looped looping loops loose loosed looses loosing lose losed loses ' +
    'losing loss losses lost lot lots lotted lotting loud loudly love loved lovely loves loving low lowed lowing lows ' +
    'lucky luggage luggages lullabied lullaby lullabying lumber lumbered lumbering lumbers lump lumped lumping lumps ' +
    'lunch lunched lunches lunching lung lunged lunging lungs machine machined machines machining mad madded madding ' +
    'mads magazine magazines magic magician magicians magics magnet magnets magnified magnify magnifying maid maided ' +
    'maiding maids mail mailbox mailboxes mailed mailing mails main mained maining mains majority make makes making ' +
    'male males mall malled malling malls mammal mammals mammoth mammoths man manage managed manages managing maned ' +
    'mango mangoes mangos manned manner mannered manners manning mans mansion mansions many map maple maples mapped ' +
    'mapping maps marathon marathoning marathons marble marbled marbles marbling march marched marches marching mark ' +
    'marked market marketed marketing markets marking marks married marry marrying marshmallow marshmallows mascot ' +
    'mascots mask masked masking masks mass massed masses massing master mastered mastering masters match matched ' +
    'matches matching material materials math maths matter mattered mattering matters maybe maybes meadow meadows ' +
    'meal mealed mealing meals mean meaned meaning means meant meantime meantimes measure measured measures measuring ' +
    'meat meated meats mechanic mechanics medal medaled medaling medalled medalling medals medicine medicined ' +
    'medicines medicining medium mediums meet meeting meets melody melon melons melt melted melting melts member ' +
    'membered members memorize memorized memorizes memorizing memory mend mended mending mends mermaid mermaids mess ' +
    'message messaged messages messaging messed messes messing met metal metaled metaling metalled metalling metals ' +
    'meted method methods meting mets microphone microphones microwave microwaved microwaves microwaving middle ' +
    'middled middles middling midnight midnights might mights mild milded milding milds mile miles milk milked ' +
    'milking milks mill milled milling million millions mills mind minded minding minds mine mined mines miniature ' +
    'miniatured miniatures miniaturing mining minus minuses minute minuted minutes minuting miracle miracles mirror ' +
    'mirrored mirroring mirrors mischief mischiefed mischiefing mischiefs miss missed misses missing mist mistake ' +
    'mistakes mistaking misted misting mists mitten mittened mittens mix mixed mixes mixing mixture mixtures model ' +
    'modeled modeling modelled modelling models modern moderns moisture moistures molecule molecules moment moments ' +
    'money moneyed moneys monkey monkeyed monkeying monkeys monster monstered monstering monsters month months ' +
    'monument monumented monumenting monuments mood moods moon mooned mooning moons more mores morning mornings ' +
    'mosquito mosquitoes mosquitos most mostly mosts moth mothed mother mothered mothering mothers moths motion ' +
    'motioned motioning motions motor motorcycle motorcycled motorcycles motorcycling motored motoring motors ' +
    'mountain mountained mountains mouse moused mouses mousing mouth mouthed mouthing mouths move moved moves movie ' +
    'movies moving much muches mud mudded muddied mudding muddy muddying muds muffin muffins mug mugged mugging mugs ' +
    'multiplied multiply multiplying mural muraled muralled murals muscle muscled muscles muscling museum museums ' +
    'mushroom mushroomed mushrooming mushrooms music musics must mustard mustards musted musting musts mystery nail ' +
    'nailed nailing nails name named names naming napkin napkins narrator narrators narrow narrowed narrowing narrows ' +
    'national nationals natural naturals nature natured natures naturing navigate navigated navigates navigating near ' +
    'neared nearing nearly nears neat neatly neats neck necked necking necklace necklaced necklaces necklacing necks ' +
    'need needed needing needle needled needles needling needs negative negatived negatives negativing neighbor ' +
    'neighbored neighboring neighbors nephew nephews nerve nerved nerves nerving nervous nest nested nesting nests ' +
    'net nets netted netting network networked networking networks never new newed newing newly news newsed newses ' +
    'newsing newspaper newspapered newspapering newspapers next nexts nice nickel nickeled nickeling nickels niece ' +
    'nieces night nighted nightmare nightmares nights nine nines noble nobles nobody nod nodded nodding nods noise ' +
    'noised noises noising none nones noodle noodled noodles noodling noon nooned nooning noons normal normals north ' +
    'northed northing norths nose nosed noses nosing note notebook notebooks noted notes nothing nothings notice ' +
    'noticed notices noticing noting novel novels now nowed nowhere nowheres nows nugget nuggeted nuggeting nuggets ' +
    'number numbered numbering numbers nurse nursed nurses nursing nut nutmeg nutmegs nuts nutted nutting oak oaked ' +
    'oaks oatmeal oatmeals obey obeyed obeying obeys object objected objecting objects observe observed observes ' +
    'observing obvious occasion occasioned occasioning occasions ocean oceans octagon octagons octopus octopuses odd ' +
    'odds odor odored odors offer offered offering offers office offices official officials often oil oiled oiling ' +
    'oils old olds olive olives omelet omelets once onces one ones onion onioned onioning onions only onto open ' +
    'opened opening openly opens operate operated operates operating opinion opinioned opinions opposite opposites ' +
    'orange oranges orbit orbited orbiting orbits orchard orcharding orchards orchestra orchestras order ordered ' +
    'ordering orders ordinary organize organized organizes organizing ostrich ostriches other others our ours outdoor ' +
    'outdoors outfit outfits outside outsides oval ovals oven ovened ovening ovens over overcoat overcoating ' +
    'overcoats overed overing overred overs owe owed owes owing owl owled owling owls own owned owning owns oxygen ' +
    'oxygens oyster oystered oystering oysters pack package packaged packages packaging packed packing packs pad ' +
    'padded padding paddle paddled paddles paddling pads page paged pages paging pain pained paining pains paint ' +
    'painted painting paints pair paired pairing pairs pajamas palace palaced palaces pale paled pales paling palm ' +
    'palmed palming palms pan pancake pancaked pancakes pancaking panda pandas paned panel paneled paneling panelled ' +
    'panelling panels paning panned panning pans panther panthers paper paperclip paperclips papered papering papers ' +
    'parachute parachuted parachutes parachuting parade paraded parades parading paragraph paragraphed paragraphing ' +
    'paragraphs parent parented parenting parents park parked parking parks parrot parroted parroting parrots part ' +
    'parted partied parting partly partner partnered partnering partners parts party partying pass passed passenger ' +
    'passengers passes passing password passwords past paste pasted pastes pasting pastry pasts pat patch patched ' +
    'patches patching pated path pathed pathing paths patience patiences patient patiented patienting patients pats ' +
    'patted pattern patterned patterning patterns patting pause paused pauses pausing paw pawed pawing paws pay payed ' +
    'paying pays pea peace peaced peaces peach peached peaches peaching peacing peacock peacocked peacocking peacocks ' +
    'peak peaked peaking peaks peanut peanuts pear pears peas pebble pebbled pebbles pebbling pedal pedaled pedaling ' +
    'pedalled pedalling pedals peel peeled peeling peels pelican pelicans pen pencil penciled penciling pencils pened ' +
    'penguin penguins pening penned pennied penning penny pens people peopled peoples peopling pepper peppered ' +
    'peppering pepperoni pepperonis peppers percent percents perfect perfected perfecting perfects perform performed ' +
    'performing performs perfume perfumed perfumes perfuming perhaps perhapses period perioded perioding periods ' +
    'permit permits person persons pet pets petted petting pharmacy phone phoned phones phoning photo photoed ' +
    'photograph photographed photographing photographs photoing photos physical physicals piano pianos pick picked ' +
    'picking pickle pickled pickles pickling picks picnic picnics picture pictured pictures picturing pie piece ' +
    'pieced pieces piecing pied pieing pies pig pigged pigging pigs piing pile piled piles piling pillow pillowcase ' +
    'pillowcases pillowed pillowing pillows pilot piloted piloting pilots pin pine pineapple pineapples pined pines ' +
    'pining pink pinked pinking pinks pinned pinning pins pinwheel pinwheeled pinwheeling pinwheels pioneer pioneered ' +
    'pioneering pioneers pipe piped pipes piping pirate pirated pirates pirating pistachio pistachios pit pitch ' +
    'pitched pitches pitching pits pitted pitting pizza pizzas place placed places placing plain plained plaining ' +
    'plains plan plane planed planes planet planets planing planned planning plans plant planted planting plants ' +
    'plastic plastics plate plated plates platform platformed platforming platforms plating play played player ' +
    'players playful playground playgrounds playing plays pleasant please pleased pleases pleasing plenty plot plots ' +
    'plotted plotting plug plugged plugging plugs plum plumber plumbers plumed pluming plums pocket pocketed ' +
    'pocketing pockets poem poems poetry point pointed pointing points poison poisoned poisoning poisons poke poked ' +
    'pokes poking polar polars pole poled poles police policed polices policing poling polish polished polishes ' +
    'polishing polite pond ponded ponding ponds ponied pony ponying pool pooled pooling pools poor poorly pop popcorn ' +
    'popcorns popped popping pops popular populars porch porches porcupine porcupines portrait portraited portraiting ' +
    'portraits positive positives possible possibles post postcard postcarded postcarding postcards posted posting ' +
    'posts pot potato potatoes poted poting pots potted pottery potting pound pounded pounding pounds pour poured ' +
    'pouring pours powder powdered powdering powders power powered powerful powering powers practice practiced ' +
    'practices practicing prairie prairied prairies praise praised praises praising predict predicted predicting ' +
    'predicts prepare prepared prepares preparing present presented presenting presents press pressed presses ' +
    'pressing pretend pretended pretending pretends prettied pretty prettying pretzel pretzels prevent prevented ' +
    'preventing prevents price priced prices pricing pride prided prides priding prince princed princes princess ' +
    'princesses princing principal principals print printed printer printers printing prints prison prisoned ' +
    'prisoning prisons private privates prize prized prizes prizing probably problem problems process processed ' +
    'processes processing produce produced produces producing program programed programing programs project projected ' +
    'projecting projects promise promised promisees promises promising pronounce pronounced pronounces pronouncing ' +
    'proper propers protect protected protecting protects protein proteins proud prove proved proves proving public ' +
    'publics pudding puddings puddle puddled puddles puddling pull pulled pulling pulls pump pumped pumping pumpkin ' +
    'pumpkins pumps punch punched punches punching pupil pupils puppet puppets puppied puppy puppying purple purpled ' +
    'purples purpling purpose purposed purposes purposing purse pursed purses pursing push pushed pushes pushing ' +
    'puzzle puzzled puzzles puzzling pyramid pyramided pyramiding pyramids quack quacked quacking quacks quarrel ' +
    'quarreled quarreling quarrels quarter quarterback quarterbacked quarterbacking quarterbacks quartered quartering ' +
    'quarters queen queened queening queens question questioned questioning questions quick quickly quicks quicksand ' +
    'quicksands quiet quieted quieting quietly quiets quilt quilted quilting quilts quit quite quited quites quiting ' +
    'quits quiz rabbit rabbited rabbiting rabbits raccoon raccoons race raced races racing rack racked racking racks ' +
    'radio radioed radioing radios radish radishes rag raged ragged ragging raging rags railroad railroaded ' +
    'railroading railroads rain rainbow rainbowed rainbows raincoat raincoats rained raining rains raise raised ' +
    'raises raisin raising raisins rake raked rakees rakes raking ranch ranched ranches ranching rang range ranged ' +
    'ranges ranging rapid rapidly rapids rare rared rarely rares raring rat rated rather rating rats ratted ratting ' +
    'rattle rattled rattles rattling raw rawing raws reach reached reaches reaching read reader readers readied ' +
    'reading reads ready readying real reallied really reallying reals reason reasoned reasoning reasons recess ' +
    'recessed recesses recessing recipe recipes record recorded recording records rectangle rectangled rectangles ' +
    'recycle recycled recycles recycling red redded redding reded reding reds reflect reflected reflecting reflects ' +
    'refuse refused refuses refusing reindeer reindeers relax relaxed relaxes relaxing remain remained remaining ' +
    'remains remember remembered remembering remembers remind reminded reminding reminds remote remotes remove ' +
    'removed removes removing rent rented renting rents repair repaired repairing repairs repeat repeated repeating ' +
    'repeats replied reply replying report reported reporting reports reptile reptiles require required requires ' +
    'requiring rescue rescued rescues rescuing research researched researches researching respect respected ' +
    'respecting respects responsible rest restaurant restaurants rested resting restroom restrooms rests return ' +
    'returned returning returns reward rewarded rewarding rewards rhinoceros rhinoceroses rhyme rhymed rhymes rhyming ' +
    'ribbon ribboned ribboning ribbons rice riced rices rich riched riches riching ricing ridden riddle riddled ' +
    'riddles riddling ride rides riding right righted righting rights ring ringed ringing rings rinse rinsed rinses ' +
    'rinsing ripe riped ripes riping rise risen rises rising river rivered rivers road roading roads roar roared ' +
    'roaring roars roast roasted roasting roasts robin robins robot robots rock rocked rocket rocketed rocketing ' +
    'rockets rocking rocks rocky rode roded rodeo rodeoed rodeoing rodeos rodes roding roll rolled rollercoaster ' +
    'rollercoastered rollercoasters rolling rolls roof roofed roofing roofs room roomed rooming rooms rooster ' +
    'roosters root rooted rooting roots rope roped ropes roping rose rosed roses rosing rotate rotated rotates ' +
    'rotating rough roughed roughing roughs round rounded rounding rounds route routed routeing routes routine ' +
    'routines routing row rowed rowing rows royal royals rub rubbed rubber rubbered rubbering rubbers rubbing rubbish ' +
    'rubbished rubbishes rubbishing rubs rude rudes rug rugged rugging rugs ruin ruined ruining ruins rule ruled ' +
    'ruler rulered rulering rulers rules ruling run runaway runaways runed rung rungs running runs rush rushed rushes ' +
    'rushing rust rusted rusting rusts sad sadded sadding saddle saddled saddles saddling sadly sads safari safaried ' +
    'safariing safaris safe safed safely safes safing sail sailboat sailboating sailboats sailed sailing sails salad ' +
    'salading salads salmon salmons salt salted salting salts same sames sand sandal sandaled sandaling sandals ' +
    'sandcastle sandcastles sanded sanding sands sandwich sandwiched sandwiches sandwiching sang sangs sank sat sated ' +
    'satellite satellited satellites satelliting sating sauce sauced sauces saucing sausage sausages save saved saves ' +
    'saving saw sawed sawing saws saxophone saxophones say sayed saying says scale scaled scales scaling scare ' +
    'scarecrow scarecrows scared scares scarf scarfed scarfing scarfs scaring scary scene scened scenery scenes ' +
    'scening schedule scheduled schedules scheduling scholar scholars school schooled schooling schools science ' +
    'scienced sciences scientist scientists scissors scooter scooters score scored scores scoring scorpion scorpions ' +
    'scout scouted scouting scouts scramble scrambled scrambles scrambling scrape scraped scrapes scraping scratch ' +
    'scratched scratches scratching scream screamed screaming screams screen screened screening screens sculpture ' +
    'sculptured sculptures sculpturing sea seal sealed sealing seals search searched searches searching seas seashell ' +
    'seashells season seasoned seasoning seasons seat seated seating seats seaweed seaweeds second seconded seconding ' +
    'seconds secret secretary secreted secreting secrets see seed seeded seeding seeds seeing seek seeking seeks seem ' +
    'seemed seeming seems seen sees seesaw seesawed seesawing seesaws seldom select selected selecting selects sell ' +
    'selling sells send sended sending sends senior seniors sense sensed senses sensing sent sented sentence ' +
    'sentenced sentences sentencing senting sents separate separated separates separating serious serve served serves ' +
    'serving set sets setting settle settled settles settling seven sevens shade shaded shades shading shadow ' +
    'shadowed shadowing shadows shake shaked shaken shakes shaking shall shallow shallowed shallowing shallows ' +
    'shampoo shampooed shampooing shampoos shape shaped shapes shaping share shared shares sharing shark sharked ' +
    'sharking sharks sharp sharped sharpen sharpened sharpening sharpens sharping sharps shave shaved shaves shaving ' +
    'she shed shedded shedding sheds sheep sheet sheeted sheeting sheets shelf shelfed shelfing shelfs shell shelled ' +
    'shelling shells shelter sheltered sheltering shelters sheriff sheriffs shes shied shift shifted shifting shifts ' +
    'shine shined shines shining ship shipped shipping ships shipwreck shipwrecked shipwrecking shipwrecks shirt ' +
    'shirted shirting shirts shiver shivered shivering shivers shock shocked shocking shocks shoe shoed shoeing shoes ' +
    'shook shooks shoot shooting shoots shop shopped shopping shops shore shored shores shoring short shortcut ' +
    'shortcuts shorted shorting shortly shorts shot shots shotted shotting shoulder shouldered shouldering shoulders ' +
    'shout shouted shouting shouts shovel shoveled shoveling shovels show showed shower showered showering showers ' +
    'showing shows shrank shrink shrinking shrinks shrunk shut shuted shuting shuts shutting shy shying sick sicked ' +
    'sicking sicks side sided sides sidewalk sidewalks siding sigh sighed sighing sighs sight sighted sighting sights ' +
    'sign signal signaled signaling signals signature signatures signed signing signs silence silenced silences ' +
    'silencing silent silently silents silk silked silking silks silly silver silvered silvering silvers simple ' +
    'simpled simples simpling simply sing singed singing single singled singles singling sings sink sinking sinks sir ' +
    'sired siring sirred sirring sirs sister sistered sistering sisters sit sited siting sits sitting six sixes size ' +
    'sized sizes sizing skate skated skates skating skeleton skeletons skied skill skilled skilling skills skin ' +
    'skinned skinning skins skip skipped skipping skips skirt skirted skirting skirts sky skyed skying skyscraper ' +
    'skyscrapers sled sledded sledding sleded sleds sleep sleeping sleeps sleeve sleeved sleeves sleeving slept slice ' +
    'sliced slices slicing slid slide slided slides sliding sling slinging slings slip sliped sliping slipped slipper ' +
    'slippered slippering slippers slippery slipping slips slow slowed slowing slowly slows slung small smalled ' +
    'smalling smalls smart smarted smarting smarts smell smelled smelling smells smile smiled smiles smiling smoke ' +
    'smoked smokes smoking smooth smoothed smoothie smoothies smoothing smoothly smooths snack snacked snacking ' +
    'snacks snail snailed snailing snails snake snaked snakes snaking sneeze sneezed sneezes sneezing sniff sniffed ' +
    'sniffing sniffs snow snowball snowballed snowballing snowballs snowed snowflake snowflakes snowing snowman snows ' +
    'soap soaped soaping soaps soccer soccers sock socked socking socks sofa sofas soft softball softballs softed ' +
    'softing softly softs soil soiled soiling soils solar solars sold soldier soldiered soldiering soldiers solds ' +
    'solid solids solve solved solves solving sombrero sombreros some somebody someday someone someones something ' +
    'somethings sometimes somewhere somewheres song songs soon sore sored sorees sores soring sorry sort sorted ' +
    'sorting sorts sought sound sounded sounding sounds soup souped souping soups sour soured souring sours south ' +
    'southed southing souths space spaced spaces spacing spade spaded spades spading spare spared spares sparing ' +
    'spark sparked sparking sparkle sparkled sparkles sparkling sparks sparrow sparrows spat spats spatted spatting ' +
    'speak speaker speakers speaking speaks special specials speed speeded speeding speeds spell spelled spelling ' +
    'spells spend spending spends spent spice spiced spices spicing spider spiders spied spill spilled spilling ' +
    'spills spin spinach spinaches spined spinning spins spiral spiraled spiraling spirals spit spited spiting spits ' +
    'spitted spitting splash splashed splashes splashing splendid spoil spoiled spoiling spoils spoke spoked spoken ' +
    'spokes spoking sponge sponged sponges sponging spoon spooned spooning spoons sport sported sporting sports spot ' +
    'spots spotted spotting sprang sprangs spray sprayed spraying sprays spread spreading spreads spring springed ' +
    'springing springs sprinkle sprinkled sprinkles sprinkling sprout sprouted sprouting sprouts sprung spun spy ' +
    'spying square squared squares squaring squash squashed squashes squashing squeeze squeezed squeezes squeezing ' +
    'squid squids squirrel squirreled squirreling squirrels stable stabled stables stabling stack stacked stacking ' +
    'stacks stadium stadiums stage stagecoach stagecoaches stagecoaching staged stages staging stair staired stairs ' +
    'stamp stamped stamping stamps stand standing stands stapler staplers star stare stared stares starfish ' +
    'starfished starfishes staring starred starring stars start started starting starts station stationed stationing ' +
    'stations statue statued statues stay stayed staying stays steadied steady steadying steal stealed stealing ' +
    'steals steam steamboat steamboats steamed steaming steams steel steeled steeling steels steep steeped steeping ' +
    'steeps stem stemed steming stemmed stemming stems step stepped stepping steps stick sticked sticking sticks ' +
    'still stilled stilling stills sting stinged stinging stings stir stired stiring stirred stirring stirs stole ' +
    'stoled stolen stoles stomach stomached stomaching stomachs stone stoned stones stoning stood stool stooled ' +
    'stooling stools stop stoped stoping stopped stopping stops stopwatch stopwatches store stored stores storied ' +
    'storing storm stormed storming storms story storying stove stoved stoves stoving straight straighted straighting ' +
    'straights strange stranger strangered strangering strangers stranges straw strawberry strawed strawing straws ' +
    'stream streamed streaming streams street streeted streeting streets strength strengths stretch stretched ' +
    'stretches stretching strike strikes striking string stringed stringing strings strip stripe striped stripes ' +
    'striping stripped stripping strips strong strongly struck strung stubborn stubborned stubborning stubborns stuck ' +
    'stucks student students studied study studying stuff stuffed stuffing stuffs stung subject subjected subjecting ' +
    'subjects submarine submarined submarines submarining subway subwayed subwaying subways success successes sudden ' +
    'suddenly suddens sugar sugared sugaring sugars suit suitcase suitcases suited suiting suits summer summered ' +
    'summering summers sun sunflower sunflowers sung sunglasses sunk sunks sunned sunning sunny sunrise sunrises ' +
    'sunrising suns sunset sunsets sunshine sunshines superhero superheroes supermarket supermarkets supper suppered ' +
    'suppering suppers supplied supply supplying sure sured sures surface surfaced surfaces surfacing suring surprise ' +
    'surprised surprises surprising surround surrounded surrounding surrounds suspect suspected suspecting suspects ' +
    'swallow swallowed swallowing swallows swam swamp swamped swamping swamps swan swanned swanning swans swear ' +
    'swearing swears sweat sweated sweater sweaters sweating sweats sweep sweeping sweeps sweet sweeted sweeting ' +
    'sweetly sweets swept swim swimming swims swimsuit swimsuits swing swinged swinging swings switch switched ' +
    'switches switching swore sworn swum swung symbol symboled symboling symbols table tabled tables tablet tableted ' +
    'tableting tablets tabling tadpole tadpoles tail tailed tailing tails take taken takes taking tale tales talk ' +
    'talked talking talks tall talls tame tamed tames taming tangerine tangerines tank tanked tanking tanks tantrum ' +
    'tantrums tap tape taped tapes taping tapped tapping taps taste tasted tastes tasting taught teach teacher ' +
    'teachers teaches teaching team teamed teaming teams teapot teapots tear teared tearing tears tease teased teases ' +
    'teasing teaspoon teaspoons teeth teethed teething telephone telephoned telephones telephoning telescope ' +
    'telescoped telescopes telescoping tell telling tells temper temperature temperatures tempered tempering tempers ' +
    'tennis tennises tent tented tenting tents term termed terming terms terrible terribles terrific test tested ' +
    'testing tests texture textured textures texturing than thank thanked thankful thanking thanks thans that the ' +
    'theater theaters theed thees their theirs them themed theming then thens there theres thermometer thermometers ' +
    'these theses they thick thicked thicking thicks thief thin thing things think thinking thinks thinned thinning ' +
    'thins third thirded thirding thirds thirsty thirteen thirteens this those though thought thoughted thoughts ' +
    'thousand thousands thread threaded threading threads three threes threw throat throated throating throats throne ' +
    'throned thrones throning through throughout throw throwing thrown throws thumb thumbed thumbing thumbs thunder ' +
    'thundered thundering thunders thunderstorm thunderstorms ticket ticketed ticketing tickets tickle tickled ' +
    'tickles tickling tide tided tides tidied tiding tidy tidying tie tied tieing ties tiger tigers tight tightly ' +
    'tights time timed times timing tiny tip tipped tipping tips tiptoe tiptoed tiptoeing tiptoes tired toad toads ' +
    'toast toasted toaster toasters toasting toasts today todays toddler toddlers toe toed toeing toes together ' +
    'toilet toileted toileting toilets toing told tomato tomatoes tomorrow tomorrows tongue tongued tongues tonguing ' +
    'tonight tonights too took tool tooled tooling tools tooth toothbrush toothbrushes toothbrushing toothed toothing ' +
    'toothpaste toothpastes tooths top toped topic topics toping topped topping tops torch torched torches torching ' +
    'tore tores torn tornado tornadoes tornados tortoise tortoises total totaled totaling totalled totalling totals ' +
    'toucan toucans touch touched touches touching tough toughed toughing toughs tour toured touring tours toward ' +
    'towards towel toweled toweling towelled towelling towels tower towered towering towers town towns toy toyed ' +
    'toying toys track tracked tracking tracks tractor tractors trade traded trades trading traffic traffics trail ' +
    'trailed trailing trails train trained training trains trampoline trampolined trampolines trampolining transport ' +
    'transported transporting transports trap traped trapeze trapezed trapezes trapezing traping trapped trapping ' +
    'traps travel traveled traveler travelers traveling travels tray trays treasure treasured treasures treasuring ' +
    'treat treated treating treats tree treed treehouse treehouses treeing trees triangle triangled triangles trick ' +
    'tricked tricking tricks tricycle tricycled tricycles tricycling tried trip tripped tripping trips trombone ' +
    'trombones trophied trophy trophying tropical tropicals trouble troubled troubles troubling trousers truck ' +
    'trucked trucking trucks true trued trueing trues truing truly trumpet trumpeted trumpeting trumpets trunk ' +
    'trunked trunking trunks trust trusted trusting trusts truth truths try trying tub tuba tubas tubbed tubbing tube ' +
    'tubed tubes tubing tubs tugboat tugboats tulip tulips tumble tumbled tumbles tumbling tune tuned tunes tuning ' +
    'tunnel tunneled tunneling tunnels turkey turkeys turn turned turning turnip turniped turniping turnips turns ' +
    'turquoise turquoises turtle turtled turtles turtling tuxedo tuxedoed tuxedoes tuxedos twin twined twining ' +
    'twinkle twinkled twinkles twinkling twinned twinning twins twist twisted twisting twists typical uglied ugly ' +
    'uglying umbrella umbrellaed umbrellaing umbrellas uncle uncled uncles uncling under understand understanded ' +
    'understanding understands understood unicorn unicorns uniform uniformed uniforming uniforms unit united uniting ' +
    'units universe universes unless until untiled untiling untilled unusual upon upper uppers upset upsets upsetting ' +
    'upside upsides upstairs use used useful usefuls uses using usual usually usuals vacation vacationed vacationing ' +
    'vacations vacuum vacuumed vacuuming vacuums valentine valentines valley valleyed valleys value valued values ' +
    'valuing vampire vampired vampires vampiring van vaned vanilla vanillas vanned vanning vans vase vases vegetable ' +
    'vegetables vehicle vehicles velvet velveted velveting velvets vendor vendors version versioned versioning ' +
    'versions very vest vested vesting vests victory video videoed videoing videos view viewed viewing views village ' +
    'villages vine vined vinegar vinegared vinegaring vinegars vines vining violet violets violin violins visit ' +
    'visited visiting visitor visitors visits vitamin vitamins voice voiced voices voicing volcano volcanoes volcanos ' +
    'volleyball volleyballs volunteer volunteered volunteering volunteers vote voted votes voting voyage voyaged ' +
    'voyages voyaging vulture vultures waffle waffled waffles waffling wag waged wagged wagging waging wagon wagoned ' +
    'wagoning wagons wags waist waisted waisting waists wait waited waiter waitered waitering waiters waiting waits ' +
    'wake waked wakes waking walk walked walking walks wall walled walling walls walrus walruses wand wands want ' +
    'wanted wanting wants wardrobe wardrobed wardrobes wardrobing warm warmed warming warmly warms warn warned ' +
    'warning warns warrior warriors was wases wash washed washer washered washering washers washes washing wasp wasps ' +
    'waste wasted wastes wasting watch watched watches watching water watered waterfall waterfalls watering ' +
    'watermelon watermelons waters wave waved waves waving wax waxed waxes waxing way wayed waying ways weak weakly ' +
    'wealth wealths wear weared wearing wears weather weathered weathering weathers weave weaved weaves weaving web ' +
    'webbed webbing webs wedding weddings week weekend weekended weekending weekends weeks weep weeping weeps weigh ' +
    'weighed weighing weighs weight weighted weighting weights welcome welcomed welcomes welcoming well welled ' +
    'welling wells went wents wept were west wested westing wests wet wets wetted wetting whale whaled whales whaling ' +
    'what whats wheat wheats wheel wheeled wheeling wheels when whens where wheres whether which while whiled whiles ' +
    'whiling whisker whiskered whiskers whisper whispered whispering whispers whistle whistled whistles whistling ' +
    'white whited whites whiting who whole wholes whom whose why whys wide wides wife wifed wifes wifing wild wilded ' +
    'wilding wildlife wildlifes wildly wilds win wind winded winding windmill windmilled windmilling windmills window ' +
    'windowed windowing windows winds wined wing winged winging wings wining winned winning wins winter wintered ' +
    'wintering winters wipe wiped wipes wiping wire wired wires wiring wise wised wisely wises wish wished wishes ' +
    'wishing wising witch witched witches witching with withed within withing withins without withouts withs wizard ' +
    'wizards woke woken wolf wolfed wolfing wolfs woman womaned womaning womans won wonder wondered wondering wonders ' +
    'woning wonned wonning wons wood wooded wooding woodpecker woodpeckers woods wool wooled wools word worded ' +
    'wording words wore work worked working works world worlded worlds worm wormed worming worms worn worried worry ' +
    'worrying worth worthed worthing worths wound wounded wounding wounds wove woven wovens wrap wrapped wrapping ' +
    'wraps wreck wrecked wrecking wrecks wring wringed wringing wrings wrinkle wrinkled wrinkles wrinkling wrist ' +
    'wrists write writes writing written wrong wronged wronging wrongs wrote wrung yard yarded yarding yards yarn ' +
    'yarned yarning yarns yawn yawned yawning yawns year years yell yelled yelling yellow yellowed yellowing yellows ' +
    'yells yes yeses yessed yessing yesterday yesterdays yet yogurt yogurts yolk yolked yolks you young youngs your ' +
    'yours yous youth youths yummy zebra zebras zero zeroed zeroes zeroing zeros zigzag zigzags zip zipped zipper ' +
    'zippered zippering zippers zipping zips zone zoned zones zoning zoo zoos zucchini zucchinis';

  /* Letter chunks that appear in many common words. Each is checked against the fallback list
     at start-up: chunks with fewer than 25 matches are dropped, the rest are ranked into tiers. */
  const CHUNKS = ('ing st ar ea an ch ou sh nd tr ee oo ck ic ow ad ol ur ai bl sp cr am th ir pr ap ig gr ag pl ' +
    'ent ate ell all ine one ear ver sc fl br cl dr qu igh ain ble ion nk ast eat fr ack ick ove ide oun gl ang ess ' +
    'str ub ug aw im ld ore ure ist ale tch ive ake ead ame ave wh ock ice ome ail sk ash out ink ft ant own ush ost ' +
    'ph int ope old ase ish oat ank eep ool ung ust ong scr sn oon ook oin oom').split(' ');

  /* ---------- Shared dictionary state (kept across restarts) ---------- */
  let fallbackSet = null;
  let fallbackList = null;
  let tiers = null;
  let fullWords = null;
  let fullPromise = null;

  function initDict() {
    if (fallbackSet) return;
    fallbackList = FALLBACK.split(' ').filter(Boolean);
    fallbackSet = new Set(fallbackList);
    const counted = [];
    for (const c of new Set(CHUNKS)) {
      let n = 0;
      for (const w of fallbackList) if (w.indexOf(c) >= 0) n++;
      if (n >= 25) counted.push({ c, n });
    }
    counted.sort((a, b) => b.n - a.n);
    const third = Math.ceil(counted.length / 3);
    tiers = [counted.slice(0, third), counted.slice(third, third * 2), counted.slice(third * 2)].map((t) => t.map((x) => x.c));
  }

  function isWord(w) {
    return fallbackSet.has(w) || (fullWords !== null && fullWords.has(w));
  }

  function loadFull() {
    if (fullWords) return Promise.resolve(fullWords);
    if (fullPromise) return fullPromise;
    if (typeof fetch !== 'function') return null;
    try {
      fullPromise = fetch(FULL_URL)
        .then((r) => (r && r.ok ? r.json() : null))
        .then((list) => {
          if (!Array.isArray(list) || list.length < 1000) return null;
          const s = new Set();
          for (const w of list) if (typeof w === 'string' && w.length >= 3 && /^[a-z]+$/.test(w)) s.add(w);
          fullWords = s;
          return s;
        })
        .catch(() => null)
        .then((res) => {
          if (!res) fullPromise = null; // allow a retry next time
          return res;
        });
    } catch (e) {
      fullPromise = null;
      return null;
    }
    return fullPromise;
  }

  /* ---------- Drawing helpers ---------- */
  function drawBomb(ctx, x, y, r, opts) {
    const o = opts || {};
    const t = o.t || 0;
    const heat = U.clamp(o.heat || 0, 0, 1);
    // Fuse
    const fuseLen = o.fuse == null ? 1 : U.clamp(o.fuse, 0, 1);
    const cx = x + r * 0.62;
    const cy = y - r * 0.62;
    ctx.strokeStyle = '#C9A26B';
    ctx.lineWidth = Math.max(3, r * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const k = i / 20;
      pts.push({ x: cx + r * 0.1 + k * r * 0.75, y: cy - r * 0.15 - Math.sin(k * Math.PI * 1.1) * r * 0.45 + k * r * 0.1 });
    }
    const n = Math.max(1, Math.round(20 * fuseLen));
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= n; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.lineCap = 'butt';
    // Spark at the end of the fuse
    const sp = pts[n];
    const flick = 1 + Math.sin(t * 40) * 0.25 + heat * 0.6;
    ctx.fillStyle = U.alpha(C.gold, 0.35);
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, r * 0.2 * flick, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + t * 9;
      const d = r * (0.1 + ((i * 37 + Math.floor(t * 30)) % 10) / 40) * flick;
      ctx.strokeStyle = i % 2 ? C.gold : C.p1;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.lineTo(sp.x + Math.cos(a) * d, sp.y + Math.sin(a) * d);
      ctx.stroke();
    }
    ctx.fillStyle = '#FFF4C2';
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, r * 0.06 * flick, 0, TAU);
    ctx.fill();
    // Cap
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#3A3470';
    U.roundRect(ctx, -r * 0.22, -r * 0.16, r * 0.44, r * 0.3, r * 0.06);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
    // Body with a heat glow
    if (heat > 0) {
      ctx.fillStyle = U.alpha(C.p1, 0.18 + heat * 0.3 * (0.6 + 0.4 * Math.sin(t * (6 + heat * 20))));
      ctx.beginPath();
      ctx.arc(x, y, r * (1.15 + heat * 0.15), 0, TAU);
      ctx.fill();
    }
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#4A4380');
    g.addColorStop(1, '#17142F');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.stroke();
    if (heat > 0.05) {
      ctx.fillStyle = U.alpha(C.p1, heat * 0.35);
      ctx.beginPath();
      ctx.arc(x, y, r - 2, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.38, y - r * 0.42, r * 0.22, r * 0.12, -0.6, 0, TAU);
    ctx.fill();
    // Chunk label
    if (o.label) {
      const size = Math.round(r * (o.label.length > 2 ? 0.5 : 0.62));
      ctx.font = F_TITLE(size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = INK;
      ctx.fillText(o.label, x + 3, y + 5);
      ctx.fillStyle = o.labelColor || C.text;
      ctx.fillText(o.label, x, y + 2);
    }
  }

  Arcade.register({
    id: 'word-bomb',
    title: 'Word Bomb',
    category: 'party',
    mode: 'together',
    players: '1–4P',
    best: 'high',
    color: C.p1,
    tagline: 'Type a word with the letters on the bomb before it blows.',
    hook: 'Every word must contain the letters on the bomb, and longer words buy more time.',
    tags: ['party', 'words', 'typing', 'spelling', 'vocabulary', 'pass and play', 'solo', 'keyboard'],
    formatScore: (n) => n + ' pts',
    howTo: 'The bomb shows a chunk of letters like ING, TR or OU. Type any real word that contains it (3 letters or more, ' +
      'never one already used this game) and press Enter. Solo endless: your time bank drains every second; each word adds ' +
      '2 seconds plus half a second for every letter beyond 4, so long words keep you alive while the chunks get harder. ' +
      'Your score is the total letters typed. Pass the bomb: 2 to 4 players share the keyboard, a valid word passes the bomb on, ' +
      'and a hidden fuse (7 to 15 seconds) ticks faster and faster. Words of 8+ letters push the fuse back 2 seconds. ' +
      'Whoever holds it when it blows loses a life; the last player standing wins.',
    controls: [
      { keys: ['A–Z'], label: 'Type a word' },
      { keys: ['Enter'], label: 'Submit the word' },
      { keys: ['Tab'], label: 'Skip the chunk in solo (costs 3 s)' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w * 0.42, h * 0.55, 10, w * 0.42, h * 0.55, w * 0.6);
      g.addColorStop(0, U.alpha(C.p1, 0.3));
      g.addColorStop(1, U.alpha(C.p1, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const pulse = t === 0 ? 0 : Math.sin(t * 5) * 0.03;
      drawBomb(ctx, 118, 116, 58 * (1 + pulse), { t, heat: t === 0 ? 0.25 : 0.25 + 0.2 * Math.sin(t * 2), label: 'ING', fuse: 0.8 });
      // Word chips
      const chips = [
        { text: 'string', x: 214, y: 34, c: C.p2 },
        { text: 'surprising', x: 196, y: 82, c: C.gold },
        { text: 'king', x: 230, y: 130, c: C.mint }
      ];
      chips.forEach((ch, i) => {
        const dx = t === 0 ? 0 : Math.sin(t * 2 + i) * 3;
        ctx.font = '800 15px Figtree, sans-serif';
        const tw = ctx.measureText(ch.text).width + 22;
        ctx.fillStyle = ch.c;
        U.roundRect(ctx, ch.x + dx, ch.y, tw, 30, 15);
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(ch.text, ch.x + dx + 11, ch.y + 16);
      });
      ctx.font = '800 16px Unbounded, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = C.mint;
      ctx.fillText('+5 s', w - 14, 186);
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.fillStyle = U.alpha(C.text, 0.7);
      ctx.textAlign = 'left';
      ctx.fillText('10 LETTERS', 196, 124);
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);
      initDict();
      let alive = true;

      /* ---------- State ---------- */
      let phase = 'menu'; // menu | names | play | boom | over
      let mode = 'solo';
      let count = 2;
      let savedNames = [];
      let players = [];
      let used = new Map();
      let recent = [];
      let chunk = '';
      let chunkT = 0;
      let lastChunks = [];
      let clock = 0;
      let phaseT = 0;
      let hits = [];
      let pointer = { x: -999, y: -999, over: false };
      let feedback = null;
      let popups = [];
      let particles = [];
      let shake = 0;
      let flash = 0;
      let flashColor = C.p1;
      let inputShake = 0;
      let inputFlash = null;
      let dictState = fullWords ? 'full' : 'basic';
      // Solo
      let bank = BANK_START;
      let score = 0;
      let wordsMade = 0;
      let longest = '';
      let lastSec = -1;
      // Pass the bomb
      let holder = 0;
      let fuse = 0;
      let fuseTotal = 1;
      let tickAcc = 0;
      let passAnim = 0;
      let passFrom = 0;
      let boomSeat = -1;
      const hinted = { solo: false, long: false };

      const aliveIdx = () => players.map((p, i) => (p.lives > 0 ? i : -1)).filter((i) => i >= 0);

      /* ---------- Background dictionary upgrade ---------- */
      (function tryFull() {
        if (fullWords) {
          dictState = 'full';
          return;
        }
        const p = loadFull();
        if (!p) return;
        dictState = 'loading';
        const timeout = new Promise((res) => api.after(6000, () => res('timeout')));
        Promise.race([p, timeout]).then((r) => {
          if (!alive) return;
          if (r && r !== 'timeout') {
            dictState = 'full';
            api.setStatus('Full dictionary loaded: ' + r.size.toLocaleString() + ' words.');
          } else {
            dictState = 'basic';
          }
        }).catch(() => { if (alive) dictState = 'basic'; });
        // A late arrival still upgrades quietly.
        p.then((r) => { if (alive && r) dictState = 'full'; }).catch(() => {});
      })();

      /* ---------- DOM input ---------- */
      const inputs = {};

      function getInput(key, maxLen) {
        let r = inputs[key];
        if (!r) {
          const el = document.createElement('input');
          el.type = 'text';
          el.setAttribute('autocomplete', 'off');
          el.setAttribute('autocapitalize', 'off');
          el.setAttribute('autocorrect', 'off');
          el.setAttribute('spellcheck', 'false');
          el.setAttribute('enterkeyhint', 'go');
          el.spellcheck = false;
          el.className = 'word-bomb-input';
          const s = el.style;
          s.position = 'absolute';
          s.boxSizing = 'border-box';
          s.margin = '0';
          s.padding = '0 14px';
          s.background = '#FFFFFF';
          s.color = INK;
          s.border = '3px solid #0B0B1A';
          s.borderRadius = '12px';
          s.font = "700 18px 'Figtree', sans-serif";
          s.outline = 'none';
          s.boxShadow = '4px 4px 0 rgba(0,0,0,.45)';
          s.zIndex = '1';
          s.display = 'none';
          stage.appendChild(el);
          r = { el, x: 0, y: 0, w: 100, h: 50, baseX: 0, visible: false, onEnter: null, onTab: null };
          api.on(el, 'keydown', (e) => {
            if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') {
              e.preventDefault();
              if (r.onEnter) r.onEnter();
            } else if ((e.key === 'Tab' || e.code === 'Tab') && r.onTab) {
              e.preventDefault();
              r.onTab();
            }
          });
          inputs[key] = r;
        }
        r.el.maxLength = maxLen;
        r.el.setAttribute('maxlength', String(maxLen));
        return r;
      }

      function showInput(r, x, y, w, h, placeholder, value, onEnter) {
        r.x = x; r.baseX = x; r.y = y; r.w = w; r.h = h;
        r.onEnter = onEnter || null;
        r.onTab = null;
        r.el.placeholder = placeholder || '';
        r.el.setAttribute('placeholder', placeholder || '');
        r.el.value = value || '';
        r.visible = true;
        r.el.style.display = 'block';
        layoutInputs();
      }

      function hideInputs() {
        for (const k in inputs) {
          const r = inputs[k];
          if (!r.visible) continue;
          r.visible = false;
          r.el.style.display = 'none';
          try { if (typeof r.el.blur === 'function') r.el.blur(); } catch (e) { /* ignore */ }
        }
      }

      const valueOf = (r) => (r && typeof r.el.value === 'string' ? r.el.value : '');

      function focusInput(r, select) {
        try {
          if (typeof r.el.focus === 'function') r.el.focus({ preventScroll: true });
          if (select && typeof r.el.select === 'function') r.el.select();
        } catch (e) { /* ignore */ }
      }

      function layoutInputs() {
        let any = false;
        for (const k in inputs) if (inputs[k].visible) any = true;
        if (!any) return;
        let ox = 0;
        let oy = 0;
        let k = 1;
        let sw = W;
        let sh = H;
        try {
          const sr = stage.getBoundingClientRect();
          const cr = canvas.getBoundingClientRect();
          const w0 = stage.clientWidth || sr.width;
          const h0 = stage.clientHeight || sr.height;
          if (cr.width > 0 && w0 > 0 && h0 > 0) {
            sw = w0;
            sh = h0;
            ox = cr.left - sr.left - (stage.clientLeft || 0);
            oy = cr.top - sr.top - (stage.clientTop || 0);
            k = cr.width / W;
          }
        } catch (e) { /* keep defaults */ }
        for (const key in inputs) {
          const r = inputs[key];
          if (!r.visible) continue;
          const s = r.el.style;
          s.left = ((ox + r.x * k) / sw * 100).toFixed(3) + '%';
          s.top = ((oy + r.y * k) / sh * 100).toFixed(3) + '%';
          s.width = (r.w * k / sw * 100).toFixed(3) + '%';
          s.height = (r.h * k / sh * 100).toFixed(3) + '%';
          s.fontSize = Math.round(U.clamp(r.h * k * 0.4, 12, 18)) + 'px';
          s.padding = '0 ' + Math.round(U.clamp(14 * k, 6, 14)) + 'px';
        }
      }

      function setInputBorder(color) {
        const r = inputs.word;
        if (r) r.el.style.borderColor = color;
      }

      /* ---------- Canvas UI kit ---------- */
      function txt(str, x, y, font, color, align, base) {
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textAlign = align || 'left';
        ctx.textBaseline = base || 'alphabetic';
        ctx.fillText(str, x, y);
      }

      function inside(p, r) {
        return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      }

      function button(x, y, w, h, label, opts, fn) {
        const o = opts || {};
        const hot = !o.disabled && pointer.over && inside(pointer, { x, y, w, h }) && !api.menuOpen;
        const lift = hot ? 2 : 0;
        ctx.globalAlpha = o.disabled ? 0.4 : 1;
        ctx.fillStyle = 'rgba(0,0,0,.4)';
        U.roundRect(ctx, x + 3, y + 4, w, h, 12);
        ctx.fill();
        ctx.fillStyle = o.color || C.panel2;
        U.roundRect(ctx, x, y - lift, w, h, 12);
        ctx.fill();
        if (!o.color) {
          ctx.strokeStyle = C.line;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (o.sub) {
          txt(label, x + w / 2, y + h / 2 - lift - 7, o.font || F_BODY(17, 800), o.color ? INK : C.text, 'center', 'middle');
          txt(o.sub, x + w / 2, y + h / 2 - lift + 12, F_LABEL(11), o.color ? INK : C.muted, 'center', 'middle');
        } else {
          txt(label, x + w / 2, y + h / 2 - lift + 1, o.font || F_BODY(17, 800), o.color ? INK : C.text, 'center', 'middle');
        }
        ctx.globalAlpha = 1;
        hits.push({ x, y, w, h, fn, disabled: !!o.disabled });
      }

      function drawBackdrop() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = U.alpha(C.line, 0.45);
        for (let x = 12; x < W; x += 24) for (let y = 12; y < H; y += 24) ctx.fillRect(x - 1, y - 1, 2, 2);
      }

      function say(text, color) {
        feedback = { text, color: color || C.text, t: 0 };
      }

      function popup(text, x, y, color, size) {
        popups.push({ text, x, y, color: color || C.mint, t: 0, size: size || 22 });
      }

      function burst(x, y, n, colors, speed) {
        for (let i = 0; i < n; i++) {
          const a = U.rand(0, TAU);
          const v = U.rand(0.3, 1) * (speed || 260);
          particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: U.rand(0.5, 1.1), max: 1.1, c: U.pick(colors), r: U.rand(2, 5) });
        }
        if (particles.length > 400) particles.splice(0, particles.length - 400);
      }

      /* ---------- Chunks ---------- */
      function chunkPool() {
        if (mode === 'solo') {
          const lvl = Math.floor(wordsMade / 5);
          if (lvl <= 0) return tiers[0];
          if (lvl === 1) return tiers[0].concat(tiers[1]);
          if (lvl === 2) return tiers[1];
          if (lvl === 3) return tiers[1].concat(tiers[2]);
          return tiers[2];
        }
        const r = Math.random();
        return r < 0.5 ? tiers[0] : r < 0.9 ? tiers[1] : tiers[2];
      }

      function freshWordsFor(c, limit) {
        let n = 0;
        for (const w of fallbackList) {
          if (w.indexOf(c) >= 0 && !used.has(w)) {
            n++;
            if (n >= limit) break;
          }
        }
        return n;
      }

      function newChunk() {
        let pool = chunkPool().filter((c) => lastChunks.indexOf(c) < 0);
        if (!pool.length) pool = tiers[0].concat(tiers[1], tiers[2]);
        let pick = null;
        for (let i = 0; i < 12 && !pick; i++) {
          const c = U.pick(pool);
          if (freshWordsFor(c, 8) >= 8) pick = c;
        }
        chunk = pick || U.pick(tiers[0]);
        lastChunks.push(chunk);
        if (lastChunks.length > 6) lastChunks.shift();
        chunkT = 0;
      }

      /* ---------- Setup ---------- */
      function showModeMenu() {
        phase = 'menu';
        hideInputs();
        api.setScore(mode === 'solo' ? 0 : '—');
        api.setStatus('Word Bomb: type words that contain the letters on the bomb.' +
          (dictState === 'full' ? ' Full dictionary ready.' : ''));
        api.menu({
          title: 'Word Bomb',
          text: 'Type a real word that contains the letters on the bomb, then press Enter. Longer words buy more time.',
          buttons: [
            { label: 'Solo endless', primary: true, onClick: startSolo },
            { label: 'Pass the bomb', onClick: showCountMenu }
          ]
        });
      }

      function showCountMenu() {
        api.menu({
          title: 'Pass the bomb',
          text: 'Share one keyboard. A valid word passes the bomb to the next player. Each player has ' + LIVES + ' lives.\nHow many players?',
          buttons: [2, 3, 4].map((n) => ({ label: n + ' players', primary: n === count, onClick: () => { count = n; showNamesMenu(); } }))
            .concat([{ label: 'Back', onClick: showModeMenu }])
        });
      }

      function showNamesMenu() {
        const have = savedNames.slice(0, count).some((n) => n);
        api.menu({
          title: 'Who is playing?',
          text: have
            ? 'Keep the names from last time, edit them, or go with Player 1 to Player ' + count + '.'
            : 'Type everyone\'s name, or just play as Player 1 to Player ' + count + '.',
          buttons: (have
            ? [{ label: 'Keep names', primary: true, onClick: () => startPass(namesFrom(savedNames)) },
              { label: 'Edit names', onClick: showNames }]
            : [{ label: 'Use Player 1–' + count, primary: true, onClick: () => startPass(namesFrom([])) },
              { label: 'Type names', onClick: showNames }])
            .concat([{ label: 'Back', onClick: showCountMenu }])
        });
      }

      function namesFrom(raw) {
        const out = [];
        for (let i = 0; i < count; i++) {
          let n = String(raw[i] || '').replace(/\s+/g, ' ').trim().slice(0, 14);
          if (!n) n = 'Player ' + (i + 1);
          let name = n;
          let k = 2;
          while (out.some((o) => o.toLowerCase() === name.toLowerCase())) name = n + ' ' + k++;
          out.push(name);
        }
        return out;
      }

      function showNames() {
        phase = 'names';
        hideInputs();
        for (let i = 0; i < count; i++) {
          const r = getInput('name' + i, 14);
          showInput(r, 325, 150 + i * 74, 310, 48, 'Player ' + (i + 1), savedNames[i] || '', () => {
            if (i + 1 < count) focusInput(inputs['name' + (i + 1)], true);
            else confirmNames();
          });
        }
        focusInput(inputs.name0, true);
        api.setStatus('Type a name for each player. Blank boxes keep Player 1, 2…');
      }

      function confirmNames() {
        if (phase !== 'names') return;
        const raw = [];
        for (let i = 0; i < count; i++) raw.push(valueOf(inputs['name' + i]));
        savedNames = raw;
        startPass(namesFrom(raw));
      }

      function drawNames() {
        drawBackdrop();
        txt("Who's playing?", W / 2, 70, F_TITLE(32), C.text, 'center', 'middle');
        txt('The bomb passes in this order. Leave a box empty to keep the default name.', W / 2, 108, F_BODY(17), C.muted, 'center', 'middle');
        for (let i = 0; i < count; i++) txt('PLAYER ' + (i + 1), 325, 150 + i * 74 - 9, F_LABEL(13), SEAT_COLORS[i], 'left', 'alphabetic');
        button(150, 500, 160, 54, 'Back', {}, () => { hideInputs(); showNamesMenu(); });
        button(650, 500, 160, 54, 'Start', { color: C.p1 }, confirmNames);
      }

      /* ---------- Game start ---------- */
      function resetCommon() {
        used = new Map();
        recent = [];
        popups = [];
        particles = [];
        lastChunks = [];
        feedback = null;
        shake = 0;
        flash = 0;
        boomSeat = -1;
        phaseT = 0;
      }

      function openWordInput() {
        const r = getInput('word', 30);
        showInput(r, 315, 418, 330, 58, mode === 'solo' ? 'Type a word…' : players[holder].name + ', type a word…', '', submitWord);
        r.onTab = mode === 'solo' ? skipChunk : null;
        setInputBorder('#0B0B1A');
        focusInput(r);
      }

      function startSolo() {
        mode = 'solo';
        resetCommon();
        players = [];
        bank = BANK_START;
        score = 0;
        wordsMade = 0;
        longest = '';
        lastSec = -1;
        phase = 'play';
        newChunk();
        hideInputs();
        openWordInput();
        api.setScore(0);
        api.setStatus('Type a word containing ' + chunk.toUpperCase() + ' and press Enter. Longer words buy more time.');
        api.sfx('power');
      }

      function startPass(names) {
        mode = 'pass';
        resetCommon();
        players = names.map((name) => ({ name, lives: LIVES, words: 0 }));
        holder = U.randInt(0, players.length - 1);
        hinted.long = false;
        hideInputs();
        newBomb();
        api.sfx('power');
      }

      function newBomb() {
        phase = 'play';
        phaseT = 0;
        fuse = U.rand(7, 15);
        fuseTotal = fuse;
        tickAcc = 0;
        passAnim = 0;
        newChunk();
        openWordInput();
        updatePassScore();
        api.setStatus(players[holder].name + ' holds the bomb: type a word with ' + chunk.toUpperCase() +
          '. Words of ' + LONG_WORD + '+ letters push the fuse back 2 s.');
      }

      function updatePassScore() {
        api.setScore(players.map((p) => p.lives).join(' · '));
      }

      /* ---------- Turn logic ---------- */
      function reject(text, color, sfx) {
        say(text, color || C.p1);
        inputShake = 0.45;
        inputFlash = { color: color || C.p1, t: 0.6 };
        setInputBorder(color || C.p1);
        api.sfx(sfx || 'hit');
      }

      function submitWord() {
        if (phase !== 'play') return;
        const r = inputs.word;
        const raw = valueOf(r).trim().toLowerCase();
        if (!raw) {
          inputShake = 0.25;
          return;
        }
        const C_ = chunk.toUpperCase();
        if (!/^[a-z]+$/.test(raw)) return reject('Letters only, please.');
        if (raw.length < 3) return reject('Too short: use 3 letters or more.');
        if (raw.indexOf(chunk) < 0) return reject('It needs ' + C_ + ' in it.');
        if (used.has(raw)) {
          const who = used.get(raw);
          return reject('Already used' + (mode === 'pass' && players[who] ? ' by ' + players[who].name : '') + '!', C.gold, 'blip');
        }
        if (!isWord(raw)) {
          return reject('"' + raw + '" is not in the ' + (dictState === 'full' ? '' : 'basic ') + 'dictionary.');
        }
        accept(raw);
      }

      function accept(word) {
        const r = inputs.word;
        const who = mode === 'pass' ? holder : 0;
        used.set(word, who);
        recent.unshift({ w: word, p: who, t: 0 });
        if (recent.length > 14) recent.pop();
        r.el.value = '';
        inputFlash = { color: '#2FBF7F', t: 0.5 };
        setInputBorder('#2FBF7F');
        burst(480, 230, 26, [C.mint, C.gold, C.p2], 280);
        if (word.length > longest.length) longest = word;
        if (mode === 'solo') {
          const bonus = 2 + 0.5 * Math.max(0, word.length - 4);
          bank = Math.min(BANK_MAX, bank + bonus);
          score += word.length;
          wordsMade++;
          api.setScore(score);
          popup('+' + bonus.toFixed(1) + ' s', 480, 360, C.mint, word.length >= LONG_WORD ? 30 : 22);
          say(word.length + ' letters: +' + word.length + ' points, +' + bonus.toFixed(1) + ' s', C.mint);
          api.sfx(word.length >= LONG_WORD ? 'power' : 'score');
          if (!hinted.solo) {
            hinted.solo = true;
            api.setStatus('Each word adds 2 s plus 0.5 s for every letter beyond 4. Long words buy the most time!');
          } else if (wordsMade % 5 === 0) {
            api.setStatus('Level up: the chunks are getting harder.');
          }
          newChunk();
        } else {
          players[holder].words++;
          if (word.length >= LONG_WORD) {
            fuse += 2;
            fuseTotal += 2;
            popup('Fuse +2 s!', 480, 120, C.gold, 28);
            api.sfx('power');
            if (!hinted.long) {
              hinted.long = true;
              api.setStatus('A long word! ' + LONG_WORD + '+ letters pushed the fuse back 2 seconds.');
            }
          } else {
            api.sfx('score');
          }
          say(players[holder].name + ' played "' + word + '"', SEAT_COLORS[holder % SEAT_COLORS.length]);
          passBomb();
        }
      }

      function nextAlive(from) {
        const n = players.length;
        for (let k = 1; k <= n; k++) {
          const i = (from + k) % n;
          if (players[i].lives > 0) return i;
        }
        return from;
      }

      function passBomb() {
        passFrom = holder;
        holder = nextAlive(holder);
        passAnim = 1;
        newChunk();
        const r = inputs.word;
        if (r) {
          r.el.placeholder = players[holder].name + ', type a word…';
          r.el.setAttribute('placeholder', r.el.placeholder);
        }
        api.sfx('flip');
        if (hinted.long || Math.random() < 0.5) {
          api.setStatus(players[holder].name + ': type a word with ' + chunk.toUpperCase() + '.');
        }
      }

      function skipChunk() {
        if (phase !== 'play' || mode !== 'solo') return;
        bank -= SKIP_COST;
        popup('−' + SKIP_COST + ' s', 480, 360, C.p1, 22);
        say('Skipped ' + chunk.toUpperCase() + '. New letters!', C.gold);
        api.sfx('flip');
        newChunk();
        const r = inputs.word;
        if (r) focusInput(r);
      }

      function explode() {
        phase = 'boom';
        phaseT = 0;
        shake = 1;
        flash = 1;
        flashColor = C.p1;
        api.sfx('boom');
        burst(480, 230, 120, [C.p1, C.gold, '#FF9A3D', C.text], 520);
        const r = inputs.word;
        if (r) {
          r.el.value = '';
          try { if (typeof r.el.blur === 'function') r.el.blur(); } catch (e) { /* ignore */ }
        }
        if (mode === 'solo') {
          bank = 0;
          api.after(1300, soloOver);
        } else {
          boomSeat = holder;
          players[holder].lives--;
          updatePassScore();
          say('BOOM! ' + players[holder].name + (players[holder].lives > 0 ? ' loses a life.' : ' is out!'), C.p1);
          api.setStatus('Boom! The bomb went off on ' + players[holder].name + ' with ' + chunk.toUpperCase() + '.');
          api.after(1900, afterBoom);
        }
      }

      function soloOver() {
        if (phase !== 'boom') return;
        phase = 'over';
        hideInputs();
        const isBest = api.reportScore(score);
        api.sfx(isBest ? 'win' : 'lose');
        api.setStatus('Out of time. Final score: ' + score + '.');
        api.menu({
          title: isBest ? 'New best: ' + score + '!' : 'Boom! Out of time',
          text: wordsMade + ' word' + (wordsMade === 1 ? '' : 's') + ' for ' + score + ' point' + (score === 1 ? '' : 's') + '.' +
            (longest ? '\nLongest word: ' + longest + ' (' + longest.length + ' letters)' : ''),
          buttons: [
            { label: 'Play again', primary: true, onClick: startSolo },
            { label: 'Change setup', onClick: showModeMenu }
          ]
        });
      }

      function afterBoom() {
        if (phase !== 'boom') return;
        const left = aliveIdx();
        if (left.length <= 1) {
          phase = 'over';
          hideInputs();
          const win = left.length ? players[left[0]] : null;
          api.sfx('win');
          const best = players.slice().sort((a, b) => b.words - a.words)[0];
          api.setStatus(win ? win.name + ' is the last player standing!' : 'Everyone is out!');
          api.menu({
            title: win ? win.name + ' wins!' : 'Nobody survived!',
            text: 'Last player standing.' + (longest ? '\nLongest word: ' + longest + '.' : '') +
              (best && best.words ? '\nMost words: ' + best.name + ' (' + best.words + ').' : ''),
            buttons: [
              { label: 'Play again', primary: true, onClick: () => startPass(players.map((p) => p.name)) },
              { label: 'Change setup', onClick: showModeMenu }
            ]
          });
          return;
        }
        holder = nextAlive(holder);
        newBomb();
      }

      /* ---------- Input ---------- */
      api.on(canvas, 'pointerdown', (e) => {
        if (api.menuOpen) return;
        const p = api.toCanvas(e, canvas);
        pointer = { x: p.x, y: p.y, over: true };
        for (let i = hits.length - 1; i >= 0; i--) {
          const h = hits[i];
          if (inside(p, h)) {
            if (!h.disabled && h.fn) h.fn();
            return;
          }
        }
        if (phase === 'play' && inputs.word) focusInput(inputs.word);
      });
      api.on(canvas, 'pointermove', (e) => {
        const p = api.toCanvas(e, canvas);
        pointer = { x: p.x, y: p.y, over: true };
      });
      api.on(canvas, 'pointerleave', () => { pointer.over = false; });

      api.on(window, 'keydown', (e) => {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || api.menuOpen) return;
        if (phase === 'play' && inputs.word && inputs.word.visible) {
          // Typing anywhere goes into the box.
          if ((e.key || '').length === 1 || e.code === 'Enter' || e.code === 'NumpadEnter') focusInput(inputs.word);
        } else if (phase === 'names' && (e.code === 'Enter' || e.code === 'NumpadEnter')) {
          confirmNames();
        }
      });

      /* ---------- Update ---------- */
      function update(dt) {
        clock += dt;
        phaseT += dt;
        chunkT += dt;
        shake = Math.max(0, shake - dt * 1.6);
        flash = Math.max(0, flash - dt * 1.5);
        passAnim = Math.max(0, passAnim - dt * 3);
        if (feedback) {
          feedback.t += dt;
          if (feedback.t > 2.6) feedback = null;
        }
        for (const p of popups) p.t += dt;
        popups = popups.filter((p) => p.t < 1.3);
        for (const p of particles) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 380 * dt;
          p.life -= dt;
        }
        particles = particles.filter((p) => p.life > 0);
        for (const r of recent) r.t += dt;
        // Input feedback (shake + colored border)
        const r = inputs.word;
        if (r && r.visible) {
          inputShake = Math.max(0, inputShake - dt);
          r.x = r.baseX + (inputShake > 0 ? Math.sin(inputShake * 70) * 8 * (inputShake / 0.45) : 0);
          if (inputFlash) {
            inputFlash.t -= dt;
            if (inputFlash.t <= 0) {
              inputFlash = null;
              setInputBorder('#0B0B1A');
            }
          }
        }
        if (phase !== 'play' || api.menuOpen) return;
        if (mode === 'solo') {
          bank -= dt;
          const sec = Math.ceil(bank);
          if (sec !== lastSec) {
            lastSec = sec;
            if (sec <= 5 && sec > 0) api.sfx('tick');
          }
          if (bank <= 0) explode();
        } else {
          fuse -= dt;
          const f = U.clamp(1 - fuse / fuseTotal, 0, 1);
          const interval = U.lerp(0.9, 0.11, Math.pow(f, 1.4));
          tickAcc += dt;
          if (tickAcc >= interval) {
            tickAcc = 0;
            api.sfx('tick');
          }
          if (fuse <= 0) explode();
        }
      }

      /* ---------- Render ---------- */
      function seatPos(i) {
        const n = players.length;
        if (n === 2) return [{ x: 150, y: 230 }, { x: 810, y: 230 }][i];
        if (n === 3) return [{ x: 150, y: 230 }, { x: 810, y: 130 }, { x: 810, y: 330 }][i];
        return [{ x: 150, y: 130 }, { x: 810, y: 130 }, { x: 810, y: 330 }, { x: 150, y: 330 }][i];
      }

      function heart(x, y, s, on) {
        ctx.fillStyle = on ? C.p1 : C.line;
        ctx.beginPath();
        ctx.moveTo(x, y + s * 0.35);
        ctx.bezierCurveTo(x - s, y - s * 0.3, x - s * 0.45, y - s, x, y - s * 0.4);
        ctx.bezierCurveTo(x + s * 0.45, y - s, x + s, y - s * 0.3, x, y + s * 0.35);
        ctx.fill();
      }

      function drawSeats() {
        players.forEach((p, i) => {
          const s = seatPos(i);
          const isHolder = i === holder && phase === 'play';
          const out = p.lives <= 0;
          const col = SEAT_COLORS[i % SEAT_COLORS.length];
          const bw = 200;
          const bh = 84;
          const x = s.x - bw / 2;
          const y = s.y - bh / 2;
          if (isHolder) {
            ctx.fillStyle = U.alpha(col, 0.25 + 0.15 * Math.sin(clock * 6));
            U.roundRect(ctx, x - 8, y - 8, bw + 16, bh + 16, 20);
            ctx.fill();
          }
          ctx.globalAlpha = out ? 0.45 : 1;
          ctx.fillStyle = C.panel;
          U.roundRect(ctx, x, y, bw, bh, 16);
          ctx.fill();
          ctx.strokeStyle = isHolder ? col : C.line;
          ctx.lineWidth = isHolder ? 4 : 2;
          ctx.stroke();
          ctx.font = F_BODY(20, 800);
          let nm = p.name;
          while (ctx.measureText(nm).width > bw - 24 && nm.length > 2) nm = nm.slice(0, -1);
          if (nm !== p.name) nm = nm.slice(0, -1) + '…';
          txt(nm, s.x, y + 28, F_BODY(20, 800), col, 'center', 'middle');
          for (let k = 0; k < LIVES; k++) heart(s.x - 26 + k * 26, y + 58, 11, k < p.lives);
          ctx.globalAlpha = 1;
          if (out) txt('OUT', s.x + 70, y + 16, F_LABEL(12), C.p1, 'center', 'middle');
          if (boomSeat === i && phase === 'boom') {
            const k = U.clamp(phaseT / 0.6, 0, 1);
            ctx.strokeStyle = U.alpha(C.p1, 1 - k);
            ctx.lineWidth = 6;
            U.roundRect(ctx, x - 20 * k, y - 20 * k, bw + 40 * k, bh + 40 * k, 20);
            ctx.stroke();
          }
        });
        // Pointer from the bomb to the holder.
        if (phase === 'play' && players[holder]) {
          const s = seatPos(holder);
          const a = Math.atan2(s.y - 230, s.x - 480);
          const r0 = 128;
          const tipX = 480 + Math.cos(a) * (r0 + 40 + Math.sin(clock * 8) * 4);
          const tipY = 230 + Math.sin(a) * (r0 + 40 + Math.sin(clock * 8) * 4);
          ctx.fillStyle = SEAT_COLORS[holder % SEAT_COLORS.length];
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - Math.cos(a - 0.45) * 26, tipY - Math.sin(a - 0.45) * 26);
          ctx.lineTo(tipX - Math.cos(a + 0.45) * 26, tipY - Math.sin(a + 0.45) * 26);
          ctx.closePath();
          ctx.fill();
        }
      }

      function drawSoloPanels() {
        // Left: score
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, 30, 110, 200, 240, 18);
        ctx.fill();
        txt('SCORE', 50, 140, F_LABEL(13), C.muted, 'left', 'middle');
        txt(String(score), 50, 182, F_TITLE(36), C.text, 'left', 'middle');
        txt('WORDS', 50, 230, F_LABEL(13), C.muted, 'left', 'middle');
        txt(String(wordsMade), 50, 256, F_BODY(24, 800), C.text, 'left', 'middle');
        txt('LEVEL', 140, 230, F_LABEL(13), C.muted, 'left', 'middle');
        txt(String(Math.min(5, Math.floor(wordsMade / 5) + 1)), 140, 256, F_BODY(24, 800), C.gold, 'left', 'middle');
        txt('LONGEST', 50, 298, F_LABEL(13), C.muted, 'left', 'middle');
        ctx.font = F_BODY(18, 800);
        let lw = longest || '—';
        while (ctx.measureText(lw).width > 160 && lw.length > 3) lw = lw.slice(0, -2) + '…';
        txt(lw, 50, 324, F_BODY(18, 800), C.p2, 'left', 'middle');
        // Right: time rules (the hook)
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, 730, 110, 200, 240, 18);
        ctx.fill();
        txt('TIME PER WORD', 750, 140, F_LABEL(13), C.muted, 'left', 'middle');
        const rows = [[4, 2], [6, 3], [8, 4], [10, 5], [12, 6]];
        rows.forEach(([len, s], i) => {
          const y = 176 + i * 32;
          const v = valueOf(inputs.word).trim().length;
          const hot = v >= len && (i === rows.length - 1 || v < rows[i + 1][0]);
          if (hot) {
            ctx.fillStyle = U.alpha(C.mint, 0.18);
            U.roundRect(ctx, 742, y - 14, 176, 28, 8);
            ctx.fill();
          }
          txt((len === 4 ? '≤4' : len) + ' letters', 752, y, F_BODY(16, 700), hot ? C.mint : C.text, 'left', 'middle');
          txt('+' + s + ' s', 908, y, F_LABEL(15), hot ? C.mint : C.gold, 'right', 'middle');
        });
        // Time bank as a burning fuse under the bomb.
        const frac = U.clamp(bank / BANK_MAX, 0, 1);
        const x0 = 300;
        const bw = 360;
        const y = 374;
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, x0, y - 9, bw, 18, 9);
        ctx.fill();
        const low = bank < 5;
        ctx.fillStyle = low ? (Math.sin(clock * 14) > 0 ? C.p1 : '#C9455A') : '#C9A26B';
        U.roundRect(ctx, x0, y - 9, Math.max(18, bw * frac), 18, 9);
        ctx.fill();
        const sx = x0 + Math.max(9, bw * frac);
        ctx.fillStyle = U.alpha(C.gold, 0.5);
        ctx.beginPath();
        ctx.arc(sx, y, 14 + Math.sin(clock * 30) * 3, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#FFF4C2';
        ctx.beginPath();
        ctx.arc(sx, y, 5, 0, TAU);
        ctx.fill();
        txt('TIME BANK', x0, y - 22, F_LABEL(12), C.muted, 'left', 'middle');
        txt(Math.max(0, bank).toFixed(1) + ' s', x0 + bw, y - 22, F_LABEL(14), low ? C.p1 : C.text, 'right', 'middle');
      }

      function drawPassHint() {
        txt('Hidden fuse · ' + LONG_WORD + '+ letters push it back 2 s', W / 2, 384, F_LABEL(13), C.muted, 'center', 'middle');
      }

      function drawRecent() {
        let x = 30;
        const y = 548;
        txt('USED', x, y - 22, F_LABEL(11), C.muted, 'left', 'middle');
        for (const r of recent) {
          ctx.font = F_BODY(15, 800);
          const tw = ctx.measureText(r.w).width + 20;
          if (x + tw > W - 30) break;
          const a = U.clamp(r.t * 4, 0, 1);
          ctx.globalAlpha = a;
          ctx.fillStyle = mode === 'pass' ? SEAT_COLORS[r.p % SEAT_COLORS.length] : C.panel2;
          U.roundRect(ctx, x, y - 14 + (1 - a) * 10, tw, 30, 15);
          ctx.fill();
          txt(r.w, x + 10, y + 2 + (1 - a) * 10, F_BODY(15, 800), mode === 'pass' ? INK : C.text, 'left', 'middle');
          ctx.globalAlpha = 1;
          x += tw + 8;
        }
      }

      function drawHud() {
        txt(mode === 'solo' ? 'SOLO ENDLESS' : 'PASS THE BOMB', 30, 34, F_LABEL(14), C.p1, 'left', 'middle');
        const label = dictState === 'full' ? 'FULL DICTIONARY' : dictState === 'loading' ? 'LOADING DICTIONARY…' : 'BASIC DICTIONARY';
        ctx.font = F_LABEL(11);
        const tw = ctx.measureText(label).width + 20;
        ctx.fillStyle = dictState === 'full' ? U.alpha(C.mint, 0.2) : C.panel;
        U.roundRect(ctx, W - 30 - tw, 22, tw, 24, 12);
        ctx.fill();
        txt(label, W - 30 - tw / 2, 35, F_LABEL(11), dictState === 'full' ? C.mint : C.muted, 'center', 'middle');
      }

      function drawPlay() {
        drawBackdrop();
        const sh = shake > 0 ? shake * 14 : 0;
        ctx.save();
        if (sh) ctx.translate(U.rand(-sh, sh), U.rand(-sh, sh));
        drawHud();
        if (mode === 'solo') drawSoloPanels();
        else {
          drawSeats();
          drawPassHint();
        }
        // The bomb
        const exploding = phase === 'boom' || phase === 'over';
        if (!exploding || phaseT < 0.08) {
          let heat;
          let fuseFrac;
          if (mode === 'solo') {
            heat = bank < 6 ? 1 - bank / 6 : 0;
            fuseFrac = U.clamp(bank / BANK_MAX, 0.05, 1);
          } else {
            const f = U.clamp(1 - fuse / fuseTotal, 0, 1);
            heat = Math.pow(f, 1.6);
            fuseFrac = 0.85;
          }
          const beat = mode === 'pass' ? Math.max(0, Math.sin(clock * (5 + heat * 22))) * (0.02 + heat * 0.04) : 0;
          const pop = 1 + Math.max(0, 0.18 - chunkT) * 1.2;
          let bx = 480;
          let by = 230;
          if (mode === 'pass' && passAnim > 0 && players[passFrom] && players[holder]) {
            const a = seatPos(passFrom);
            const k = 1 - passAnim;
            bx = U.lerp(480 + (a.x - 480) * 0.25, 480, k);
            by = U.lerp(230 + (a.y - 230) * 0.25, 230, k) - Math.sin(k * Math.PI) * 30;
          }
          ctx.save();
          ctx.translate(bx, by);
          ctx.scale(pop + beat, pop + beat);
          drawBomb(ctx, 0, 0, 104, { t: clock, heat, label: chunk.toUpperCase(), fuse: fuseFrac, labelColor: heat > 0.6 ? '#FFE0E5' : C.text });
          ctx.restore();
        } else {
          // Explosion rings
          const k = U.clamp(phaseT / 0.9, 0, 1);
          for (let i = 0; i < 3; i++) {
            const kk = U.clamp(k * 1.3 - i * 0.15, 0, 1);
            ctx.strokeStyle = U.alpha(i === 0 ? C.gold : i === 1 ? C.p1 : '#FF9A3D', 1 - kk);
            ctx.lineWidth = 16 * (1 - kk) + 2;
            ctx.beginPath();
            ctx.arc(480, 230, 40 + kk * 260, 0, TAU);
            ctx.stroke();
          }
          ctx.globalAlpha = U.clamp(1 - k, 0, 1);
          txt('BOOM!', 480, 230, F_TITLE(64), C.gold, 'center', 'middle');
          ctx.globalAlpha = 1;
        }
        // Go / skip buttons beside the input
        if (phase === 'play') {
          button(657, 418, 100, 58, 'Go', { color: C.p1, font: F_BODY(20, 800) }, submitWord);
          if (mode === 'solo') button(203, 418, 100, 58, 'Skip', { sub: '−' + SKIP_COST + ' s · Tab', font: F_BODY(17, 800) }, skipChunk);
        }
        // Feedback line
        if (feedback) {
          const a = U.clamp(Math.min(feedback.t * 8, (2.6 - feedback.t) * 3), 0, 1);
          ctx.globalAlpha = a;
          txt(feedback.text, W / 2, 500, F_BODY(20, 800), feedback.color, 'center', 'middle');
          ctx.globalAlpha = 1;
        } else if (phase === 'play') {
          const tip = mode === 'solo'
            ? 'Type a word with ' + chunk.toUpperCase() + ' · Enter to submit'
            : players[holder].name + ': a word with ' + chunk.toUpperCase() + ' · Enter passes the bomb';
          txt(tip, W / 2, 500, F_BODY(17), C.muted, 'center', 'middle');
        }
        drawRecent();
        // Popups and particles
        for (const p of popups) {
          const k = p.t / 1.3;
          ctx.globalAlpha = U.clamp(1.4 - k * 1.4, 0, 1);
          txt(p.text, p.x, p.y - k * 60, F_TITLE(p.size), p.color, 'center', 'middle');
        }
        ctx.globalAlpha = 1;
        for (const p of particles) {
          ctx.globalAlpha = U.clamp(p.life / 0.6, 0, 1);
          ctx.fillStyle = p.c;
          ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
        if (flash > 0) {
          ctx.fillStyle = U.alpha(flashColor, flash * 0.4);
          ctx.fillRect(0, 0, W, H);
        }
      }

      function drawMenuBackdrop() {
        drawBackdrop();
        drawBomb(ctx, 480, 300, 130, { t: clock, heat: 0.2 + 0.1 * Math.sin(clock * 2), label: lastChunks.length ? chunk.toUpperCase() : 'ING', fuse: 0.9 });
        drawHud();
      }

      function draw() {
        hits = [];
        if (phase === 'play' || phase === 'boom' || (phase === 'over' && (mode === 'solo' || players.length))) drawPlay();
        else if (phase === 'names') drawNames();
        else drawMenuBackdrop();
      }

      showModeMenu();
      api.loop((dt) => {
        update(dt);
        draw();
        layoutInputs();
      });

      return {
        destroy() {
          alive = false;
        }
      };
    }
  });
})();
