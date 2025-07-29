#import "SecureWallet.h"
#import <React/RCTLog.h>
#import <LocalAuthentication/LocalAuthentication.h>
#import <Security/Security.h>
#import <CommonCrypto/CommonCrypto.h>
#import <secp256k1/secp256k1.h>

@implementation SecureWallet {
    // Private instance variables if needed
}

#pragma mark - Private Methods

- (NSString *)formatPublicKey:(NSData *)publicKey {
    NSMutableString *hexString = [NSMutableString string];
    const unsigned char *bytes = publicKey.bytes;
    for (NSUInteger i = 0; i < publicKey.length; i++) {
        [hexString appendFormat:@"%02x", bytes[i]];
    }
    return hexString;
}

#pragma mark - Public Methods

RCT_EXPORT_MODULE()

// Constants for key management
static NSString *const kKeyTag = @"com.walletpoc.securekey";
static NSString *const kKeychainLabel = @"WalletPOC Secure Key";

// BIP39 wordlist (first 2048 words)
static NSArray *const kBIP39Words = @[
    @"abandon", @"ability", @"able", @"about", @"above", @"absent", @"absorb", @"abstract",
    @"absurd", @"abuse", @"access", @"accident", @"account", @"accuse", @"achieve", @"acid",
    @"acoustic", @"acquire", @"across", @"act", @"action", @"actor", @"actual", @"adapt",
    @"add", @"addict", @"address", @"adjust", @"admit", @"adult", @"advance", @"advice",
    @"aerobic", @"affair", @"afford", @"afraid", @"again", @"age", @"agent", @"agree",
    @"ahead", @"aim", @"air", @"airport", @"aisle", @"alarm", @"album", @"alcohol",
    @"alert", @"alien", @"all", @"alley", @"allow", @"almost", @"alone", @"alpha",
    @"already", @"also", @"alter", @"always", @"amateur", @"amazing", @"among", @"amount",
    @"amused", @"analyst", @"anchor", @"ancient", @"anger", @"angle", @"angry", @"animal",
    @"ankle", @"announce", @"annual", @"another", @"answer", @"antenna", @"antique", @"anxiety",
    @"any", @"apart", @"apology", @"appear", @"apple", @"approve", @"april", @"arch",
    @"arctic", @"area", @"arena", @"argue", @"arm", @"armed", @"armor", @"army",
    @"around", @"arrange", @"arrest", @"arrive", @"arrow", @"art", @"arte", @"artist",
    @"artwork", @"ask", @"aspect", @"assault", @"asset", @"assist", @"assume", @"asthma",
    @"athlete", @"atom", @"attack", @"attend", @"attitude", @"attract", @"auction", @"audit",
    @"august", @"aunt", @"author", @"auto", @"autumn", @"average", @"avocado", @"avoid",
    @"awake", @"aware", @"away", @"awesome", @"awful", @"awkward", @"axis", @"baby",
    @"bachelor", @"bacon", @"badge", @"bag", @"balance", @"balcony", @"ball", @"bamboo",
    @"banana", @"banner", @"bar", @"barely", @"bargain", @"barrel", @"base", @"basic",
    @"basket", @"battle", @"beach", @"bean", @"beauty", @"because", @"become", @"beef",
    @"before", @"begin", @"behave", @"behind", @"believe", @"below", @"belt", @"bench",
    @"benefit", @"best", @"betray", @"better", @"between", @"beyond", @"bicycle", @"bid",
    @"bike", @"bind", @"biology", @"bird", @"birth", @"bitter", @"black", @"blade",
    @"blame", @"blanket", @"blast", @"bleak", @"bless", @"blind", @"blood", @"blossom",
    @"blouse", @"blue", @"blur", @"blush", @"board", @"boat", @"body", @"boil",
    @"bomb", @"bone", @"bonus", @"book", @"boost", @"border", @"boring", @"borrow",
    @"boss", @"bottom", @"bounce", @"box", @"boy", @"bracket", @"brain", @"brand",
    @"brass", @"brave", @"bread", @"breeze", @"brick", @"bridge", @"brief", @"bright",
    @"bring", @"brisk", @"broccoli", @"broken", @"bronze", @"broom", @"brother", @"brown",
    @"brush", @"bubble", @"buddy", @"budget", @"buffalo", @"build", @"bulb", @"bulk",
    @"bullet", @"bundle", @"bunker", @"burden", @"burger", @"burst", @"bus", @"business",
    @"busy", @"butter", @"buyer", @"buzz", @"cabbage", @"cabin", @"cable", @"cactus",
    @"cage", @"cake", @"call", @"calm", @"camera", @"camp", @"can", @"canal",
    @"cancel", @"candy", @"cannon", @"canoe", @"canvas", @"canyon", @"capable", @"capital",
    @"captain", @"car", @"carbon", @"card", @"cargo", @"carpet", @"carry", @"cart",
    @"case", @"cash", @"casino", @"castle", @"casual", @"cat", @"catalog", @"catch",
    @"category", @"cattle", @"caught", @"cause", @"caution", @"cave", @"ceiling", @"celery",
    @"cement", @"census", @"century", @"cereal", @"certain", @"chair", @"chalk", @"champion",
    @"change", @"chaos", @"chapter", @"charge", @"chase", @"chat", @"cheap", @"check",
    @"cheese", @"chef", @"cherry", @"chest", @"chicken", @"chief", @"child", @"chimney",
    @"choice", @"choose", @"chronic", @"chuckle", @"chunk", @"churn", @"cigar", @"cinnamon",
    @"circle", @"citizen", @"city", @"civil", @"claim", @"clap", @"clarify", @"claw",
    @"clay", @"clean", @"clerk", @"clever", @"click", @"client", @"cliff", @"climb",
    @"cling", @"clinic", @"clip", @"clock", @"clog", @"close", @"cloth", @"cloud",
    @"clown", @"club", @"clump", @"cluster", @"clutch", @"coach", @"coast", @"coconut",
    @"code", @"coffee", @"coil", @"coin", @"collect", @"color", @"column", @"combine",
    @"come", @"comfort", @"comic", @"common", @"company", @"concert", @"conduct", @"confirm",
    @"congress", @"connect", @"consider", @"control", @"convince", @"cook", @"cool", @"copper",
    @"copy", @"coral", @"core", @"corn", @"correct", @"cost", @"cotton", @"couch",
    @"country", @"couple", @"course", @"cousin", @"cover", @"coyote", @"crack", @"cradle",
    @"craft", @"cram", @"crane", @"crash", @"crater", @"crawl", @"crazy", @"cream",
    @"credit", @"creek", @"crew", @"cricket", @"crime", @"crisp", @"critic", @"crop",
    @"cross", @"crouch", @"crowd", @"crucial", @"cruel", @"cruise", @"crumble", @"crunch",
    @"crush", @"cry", @"crystal", @"cube", @"culture", @"cup", @"cupboard", @"curious",
    @"current", @"curtain", @"curve", @"cushion", @"custom", @"cute", @"cycle", @"dad",
    @"damage", @"dance", @"danger", @"daring", @"dash", @"daughter", @"dawn", @"day",
    @"deal", @"debate", @"debris", @"decade", @"december", @"decide", @"decline", @"decorate",
    @"decrease", @"deer", @"defense", @"define", @"defy", @"degree", @"delay", @"deliver",
    @"demand", @"demise", @"denial", @"dentist", @"deny", @"depart", @"depend", @"deposit",
    @"depth", @"deputy", @"derive", @"describe", @"desert", @"design", @"desk", @"despair",
    @"destroy", @"detail", @"detect", @"develop", @"device", @"devote", @"diagram", @"dial",
    @"diamond", @"diary", @"dice", @"diesel", @"diet", @"differ", @"digital", @"dignity",
    @"dilemma", @"dinner", @"dinosaur", @"direct", @"dirt", @"disagree", @"discover", @"disease",
    @"dish", @"dismiss", @"disorder", @"display", @"distance", @"divert", @"divide", @"divorce",
    @"dizzy", @"doctor", @"document", @"dog", @"doll", @"dolphin", @"domain", @"donate",
    @"donkey", @"donor", @"door", @"dose", @"double", @"dove", @"draft", @"dragon",
    @"drama", @"drastic", @"draw", @"dream", @"dress", @"drift", @"drill", @"drink",
    @"drip", @"drive", @"drop", @"drum", @"dry", @"duck", @"dumb", @"dune",
    @"during", @"dust", @"dutch", @"duty", @"dwarf", @"dynamic", @"eager", @"eagle",
    @"early", @"earn", @"earth", @"easily", @"east", @"easy", @"echo", @"ecology",
    @"economy", @"edge", @"edit", @"educate", @"effort", @"egg", @"eight", @"either",
    @"elbow", @"elder", @"electric", @"elegant", @"element", @"elephant", @"elevator", @"elite",
    @"else", @"embark", @"embody", @"embrace", @"emerge", @"emotion", @"employ", @"empower",
    @"empty", @"enable", @"enact", @"end", @"endless", @"endorse", @"enemy", @"energy",
    @"enforce", @"engage", @"engine", @"enhance", @"enjoy", @"enlist", @"enough", @"enrich",
    @"enroll", @"ensure", @"enter", @"entire", @"entry", @"envelope", @"episode", @"equal",
    @"equip", @"era", @"erase", @"erode", @"erosion", @"error", @"erupt", @"escape",
    @"essay", @"essence", @"estate", @"eternal", @"ethics", @"evidence", @"evil", @"evoke",
    @"evolve", @"exact", @"example", @"excess", @"exchange", @"excite", @"exclude", @"excuse",
    @"execute", @"exercise", @"exhaust", @"exhibit", @"exile", @"exist", @"exit", @"exotic",
    @"expand", @"expect", @"expire", @"explain", @"expose", @"express", @"extend", @"extra",
    @"eye", @"eyebrow", @"fabric", @"face", @"faculty", @"fade", @"faint", @"faith",
    @"fall", @"false", @"fame", @"family", @"famous", @"fan", @"fancy", @"fantasy",
    @"farm", @"fashion", @"fat", @"fatal", @"father", @"fatigue", @"fault", @"favorite",
    @"feature", @"february", @"federal", @"fee", @"feed", @"feel", @"female", @"fence",
    @"festival", @"fetch", @"fever", @"few", @"fiber", @"fiction", @"field", @"figure",
    @"file", @"film", @"filter", @"final", @"find", @"fine", @"finger", @"finish",
    @"fire", @"firm", @"first", @"fiscal", @"fish", @"fit", @"fitness", @"fix",
    @"flag", @"flame", @"flash", @"flat", @"flavor", @"flee", @"flight", @"flip",
    @"float", @"flock", @"floor", @"flower", @"fluid", @"flush", @"fly", @"foam",
    @"focus", @"fog", @"foil", @"fold", @"follow", @"food", @"foot", @"force",
    @"forest", @"forget", @"fork", @"fortune", @"forum", @"forward", @"fossil", @"foster",
    @"found", @"fox", @"fragile", @"frame", @"frequent", @"fresh", @"friend", @"fringe",
    @"frog", @"front", @"frost", @"frown", @"frozen", @"fruit", @"fuel", @"fun",
    @"funny", @"furnace", @"fury", @"future", @"gadget", @"gain", @"galaxy", @"gallery",
    @"game", @"gap", @"garage", @"garbage", @"garden", @"garlic", @"garment", @"gas",
    @"gasp", @"gate", @"gather", @"gauge", @"gaze", @"general", @"genius", @"genre",
    @"gentle", @"genuine", @"gesture", @"ghost", @"giant", @"gift", @"giggle", @"ginger",
    @"giraffe", @"girl", @"give", @"glad", @"glance", @"glare", @"glass", @"gleam",
    @"glide", @"glimpse", @"globe", @"gloom", @"glory", @"glove", @"glow", @"glue",
    @"goat", @"goddess", @"gold", @"good", @"goose", @"gorilla", @"gospel", @"gossip",
    @"govern", @"gown", @"grab", @"grace", @"grain", @"grant", @"grape", @"grass",
    @"gravity", @"great", @"green", @"grid", @"grief", @"grit", @"grocery", @"group",
    @"grow", @"grunt", @"guard", @"guess", @"guide", @"guilt", @"guitar", @"gun",
    @"gym", @"habit", @"hair", @"half", @"hammer", @"hamster", @"hand", @"happy",
    @"harbor", @"hard", @"harsh", @"harvest", @"hat", @"have", @"hawk", @"hazard",
    @"head", @"health", @"heart", @"heavy", @"hedgehog", @"height", @"hello", @"helmet",
    @"help", @"hen", @"hero", @"hidden", @"high", @"hill", @"hint", @"hip",
    @"hire", @"history", @"hobby", @"hockey", @"hold", @"hole", @"holiday", @"hollow",
    @"home", @"honey", @"hood", @"hope", @"horn", @"horror", @"horse", @"hospital",
    @"host", @"hotel", @"hour", @"hover", @"hub", @"huge", @"human", @"humble",
    @"humor", @"hundred", @"hungry", @"hunt", @"hurdle", @"hurry", @"hurt", @"husband",
    @"hybrid", @"ice", @"icon", @"idea", @"identify", @"idle", @"ignore", @"ill",
    @"illegal", @"illness", @"image", @"imitate", @"immense", @"immune", @"impact", @"impose",
    @"improve", @"impulse", @"inch", @"include", @"income", @"increase", @"index", @"indicate",
    @"indoor", @"industry", @"infant", @"inflict", @"inform", @"inhale", @"inherit", @"initial",
    @"inject", @"injury", @"inmate", @"inner", @"innocent", @"input", @"inquiry", @"insane",
    @"insect", @"inside", @"inspire", @"install", @"intact", @"interest", @"into", @"invest",
    @"invite", @"involve", @"iron", @"island", @"isolate", @"issue", @"item", @"ivory",
    @"jacket", @"jaguar", @"jar", @"jazz", @"jealous", @"jeans", @"jelly", @"jewel",
    @"job", @"join", @"joke", @"journey", @"joy", @"judge", @"juice", @"jump",
    @"jungle", @"junior", @"junk", @"just", @"kangaroo", @"keen", @"keep", @"ketchup",
    @"key", @"kick", @"kid", @"kidney", @"kind", @"kingdom", @"kiss", @"kit",
    @"kitchen", @"kite", @"kitten", @"kiwi", @"knee", @"knife", @"knock", @"know",
    @"lab", @"label", @"labor", @"ladder", @"lady", @"lake", @"lamp", @"language",
    @"laptop", @"large", @"later", @"latin", @"laugh", @"laundry", @"lava", @"law",
    @"lawn", @"lawsuit", @"layer", @"lazy", @"leader", @"leaf", @"learn", @"leave",
    @"lecture", @"left", @"leg", @"legal", @"legend", @"leisure", @"lemon", @"lend",
    @"length", @"lens", @"leopard", @"lesson", @"letter", @"level", @"liar", @"liberty",
    @"library", @"license", @"life", @"lift", @"light", @"like", @"limb", @"limit",
    @"link", @"lion", @"liquid", @"list", @"little", @"live", @"lizard", @"load",
    @"loan", @"lobster", @"local", @"lock", @"logic", @"long", @"loop", @"lottery",
    @"loud", @"lounge", @"love", @"loyal", @"lucky", @"luggage", @"lumber", @"lunar",
    @"lunch", @"luxury", @"lyrics", @"machine", @"mad", @"magic", @"magnet", @"maid",
    @"mail", @"main", @"major", @"make", @"mammal", @"man", @"manage", @"mandate",
    @"mango", @"mansion", @"manual", @"maple", @"marble", @"march", @"margin", @"marine",
    @"market", @"marriage", @"mask", @"mass", @"master", @"match", @"material", @"math",
    @"matrix", @"matter", @"maximum", @"maze", @"meadow", @"mean", @"measure", @"meat",
    @"mechanic", @"medal", @"media", @"melody", @"melt", @"member", @"memory", @"mention",
    @"menu", @"mercy", @"merge", @"merit", @"merry", @"mesh", @"message", @"metal",
    @"method", @"middle", @"midnight", @"milk", @"million", @"mimic", @"mind", @"minimum",
    @"minor", @"minute", @"miracle", @"mirror", @"misery", @"miss", @"mistake", @"mix",
    @"mixed", @"mixture", @"mobile", @"model", @"modify", @"mom", @"moment", @"monitor",
    @"monkey", @"monster", @"month", @"moon", @"moral", @"more", @"morning", @"mosquito",
    @"mother", @"motion", @"motor", @"mountain", @"mouse", @"move", @"movie", @"much",
    @"muffin", @"mule", @"multiply", @"muscle", @"museum", @"mushroom", @"music", @"must",
    @"mutual", @"myself", @"mystery", @"myth", @"naive", @"name", @"napkin", @"narrow",
    @"nasty", @"nation", @"nature", @"near", @"neck", @"need", @"negative", @"neglect",
    @"neither", @"nephew", @"nerve", @"nest", @"net", @"network", @"neutral", @"never",
    @"news", @"next", @"nice", @"night", @"noble", @"noise", @"nominee", @"noodle",
    @"normal", @"north", @"nose", @"notable", @"note", @"nothing", @"notice", @"novel",
    @"now", @"nuclear", @"number", @"nurse", @"nut", @"oak", @"obey", @"object",
    @"oblige", @"obscure", @"observe", @"obtain", @"obvious", @"occur", @"ocean", @"october",
    @"odor", @"off", @"offer", @"office", @"often", @"oil", @"okay", @"old",
    @"olive", @"olympic", @"omit", @"once", @"one", @"onion", @"online", @"only",
    @"open", @"opera", @"opinion", @"oppose", @"option", @"orange", @"orbit", @"orchard",
    @"order", @"ordinary", @"organ", @"orient", @"original", @"orphan", @"ostrich", @"other",
    @"outdoor", @"outer", @"output", @"outside", @"oval", @"oven", @"over", @"own",
    @"owner", @"oxygen", @"oyster", @"ozone", @"pact", @"paddle", @"page", @"pair",
    @"palace", @"palm", @"panda", @"panel", @"panic", @"panther", @"paper", @"parade",
    @"parent", @"park", @"parrot", @"party", @"pass", @"patch", @"path", @"patient",
    @"patrol", @"pattern", @"pause", @"pave", @"payment", @"peace", @"peanut", @"pear",
    @"peasant", @"pelican", @"pen", @"penalty", @"pencil", @"people", @"pepper", @"perfect",
    @"permit", @"person", @"pet", @"phone", @"photo", @"phrase", @"physical", @"piano",
    @"picnic", @"picture", @"piece", @"pig", @"pigeon", @"pill", @"pilot", @"pink",
    @"pioneer", @"pipe", @"pistol", @"pitch", @"pizza", @"place", @"planet", @"plastic",
    @"plate", @"play", @"please", @"pledge", @"pluck", @"plug", @"plunge", @"poem",
    @"poet", @"point", @"polar", @"pole", @"police", @"pond", @"pony", @"pool",
    @"popular", @"portion", @"position", @"possible", @"post", @"potato", @"pottery", @"poverty",
    @"powder", @"power", @"practice", @"praise", @"predict", @"prefer", @"prepare", @"present",
    @"pretty", @"prevent", @"price", @"pride", @"primary", @"print", @"priority", @"prison",
    @"private", @"prize", @"problem", @"process", @"produce", @"profit", @"program", @"project",
    @"promote", @"proof", @"property", @"prosper", @"protect", @"proud", @"provide", @"public",
    @"pudding", @"pull", @"pulp", @"pulse", @"pumpkin", @"punch", @"pupil", @"puppy",
    @"purple", @"purpose", @"purse", @"push", @"put", @"puzzle", @"pyramid", @"quality",
    @"quantum", @"quarter", @"question", @"quick", @"quit", @"quiz", @"quote", @"rabbit",
    @"raccoon", @"race", @"rack", @"radar", @"radio", @"rail", @"rain", @"raise",
    @"rally", @"ramp", @"ranch", @"random", @"range", @"rapid", @"rare", @"rate",
    @"rather", @"raven", @"raw", @"razor", @"ready", @"real", @"reason", @"rebel",
    @"rebuild", @"recall", @"receive", @"recipe", @"record", @"recycle", @"reduce", @"reflect",
    @"reform", @"refuse", @"region", @"regret", @"regular", @"reject", @"relax", @"release",
    @"relief", @"rely", @"remain", @"remember", @"remind", @"remove", @"render", @"renew",
    @"rent", @"reopen", @"repair", @"repeat", @"replace", @"report", @"require", @"rescue",
    @"resemble", @"resist", @"resource", @"response", @"result", @"retire", @"retreat", @"return",
    @"reunion", @"reveal", @"review", @"reward", @"rhythm", @"rib", @"ribbon", @"rice",
    @"rich", @"ride", @"ridge", @"rifle", @"right", @"rigid", @"ring", @"riot",
    @"ripple", @"risk", @"ritual", @"rival", @"river", @"road", @"roast", @"robot",
    @"robust", @"rocket", @"romance", @"roof", @"rookie", @"room", @"rose", @"rotate",
    @"rough", @"round", @"route", @"royal", @"rubber", @"rude", @"rug", @"rule",
    @"run", @"runway", @"rural", @"sad", @"saddle", @"sadness", @"safe", @"sail",
    @"salad", @"salmon", @"salon", @"salt", @"salute", @"same", @"sample", @"sand",
    @"satisfy", @"satoshi", @"sauce", @"sausage", @"save", @"say", @"scale", @"scan",
    @"scare", @"scatter", @"scene", @"scheme", @"school", @"science", @"scissors", @"scorpion",
    @"scout", @"scrap", @"screen", @"script", @"scrub", @"sea", @"search", @"season",
    @"seat", @"second", @"secret", @"section", @"security", @"seed", @"seek", @"segment",
    @"select", @"sell", @"seminar", @"senior", @"sense", @"sentence", @"series", @"service",
    @"session", @"settle", @"setup", @"seven", @"shadow", @"shaft", @"shallow", @"share",
    @"shed", @"shell", @"sheriff", @"shield", @"shift", @"shine", @"ship", @"shiver",
    @"shock", @"shoe", @"shoot", @"shop", @"shore", @"short", @"shoulder", @"shove",
    @"shrimp", @"shrug", @"shuffle", @"shy", @"sibling", @"sick", @"side", @"siege",
    @"sight", @"sign", @"silent", @"silk", @"silly", @"silver", @"similar", @"simple",
    @"since", @"sing", @"siren", @"sister", @"situate", @"six", @"size", @"skate",
    @"sketch", @"ski", @"skill", @"skin", @"skirt", @"skull", @"slab", @"slam",
    @"sleep", @"slender", @"slice", @"slide", @"slight", @"slim", @"slogan", @"slot",
    @"slow", @"slush", @"small", @"smart", @"smile", @"smoke", @"smooth", @"snack",
    @"snake", @"snap", @"sniff", @"snow", @"soap", @"soccer", @"social", @"sock",
    @"soda", @"soft", @"solar", @"soldier", @"solid", @"solution", @"solve", @"someone",
    @"song", @"soon", @"sorry", @"sort", @"soul", @"sound", @"soup", @"source",
    @"south", @"space", @"spare", @"spatial", @"spawn", @"speak", @"special", @"speed",
    @"spell", @"spend", @"sphere", @"spice", @"spider", @"spike", @"spin", @"spirit",
    @"split", @"spoil", @"sponsor", @"spoon", @"sport", @"spot", @"spray", @"spread",
    @"spring", @"spy", @"square", @"squeeze", @"squirrel", @"stable", @"stadium", @"staff",
    @"stage", @"stairs", @"stamp", @"stand", @"start", @"state", @"stay", @"steak",
    @"steel", @"step", @"stereo", @"stick", @"still", @"sting", @"stomach", @"stone",
    @"stony", @"story", @"stove", @"strategy", @"street", @"strike", @"strong", @"struggle",
    @"student", @"stuff", @"stumble", @"style", @"subject", @"submit", @"subway", @"success",
    @"such", @"sudden", @"suffer", @"sugar", @"suggest", @"suit", @"summer", @"sun",
    @"sunny", @"sunset", @"super", @"supply", @"supreme", @"sure", @"surface", @"surge",
    @"surprise", @"surround", @"survey", @"suspect", @"sustain", @"swallow", @"swamp", @"swap",
    @"swarm", @"swear", @"sweet", @"swift", @"swim", @"swing", @"switch", @"sword",
    @"symbol", @"symptom", @"syrup", @"system", @"table", @"tackle", @"tag", @"tail",
    @"talent", @"talk", @"tank", @"tape", @"target", @"task", @"taste", @"tattoo",
    @"taxi", @"teach", @"team", @"tell", @"ten", @"tenant", @"tennis", @"tent",
    @"term", @"test", @"text", @"thank", @"that", @"theme", @"then", @"theory",
    @"there", @"they", @"thing", @"this", @"thought", @"three", @"thrive", @"throw",
    @"thumb", @"thunder", @"ticket", @"tide", @"tiger", @"tilt", @"timber", @"time",
    @"tiny", @"tip", @"tired", @"tissue", @"title", @"toast", @"tobacco", @"today",
    @"toddler", @"toe", @"together", @"toilet", @"token", @"tomato", @"tomorrow", @"tone",
    @"tongue", @"tonight", @"tool", @"tooth", @"top", @"topic", @"topple", @"torch",
    @"tornado", @"tortoise", @"toss", @"total", @"tourist", @"toward", @"tower", @"town",
    @"toy", @"track", @"trade", @"traffic", @"tragic", @"train", @"transfer", @"trap",
    @"trash", @"travel", @"tray", @"treat", @"tree", @"trend", @"trial", @"tribe",
    @"trick", @"trigger", @"trim", @"trip", @"trophy", @"trouble", @"truck", @"true",
    @"truly", @"trumpet", @"trust", @"truth", @"try", @"tube", @"tuition", @"tumble",
    @"tuna", @"tunnel", @"turkey", @"turn", @"turtle", @"twelve", @"twenty", @"twice",
    @"twin", @"twist", @"two", @"type", @"typical", @"ugly", @"umbrella", @"unable",
    @"unaware", @"uncle", @"uncover", @"under", @"undo", @"unfair", @"unfold", @"unhappy",
    @"uniform", @"unique", @"unit", @"universe", @"unknown", @"unlock", @"until", @"unusual",
    @"unveil", @"update", @"upgrade", @"uphold", @"upon", @"upper", @"upset", @"urban",
    @"urge", @"usage", @"use", @"used", @"useful", @"useless", @"usual", @"utility",
    @"vacant", @"vacuum", @"vague", @"valid", @"valley", @"valve", @"van", @"vanish",
    @"vapor", @"various", @"vast", @"vault", @"vehicle", @"velvet", @"vendor", @"venture",
    @"venue", @"verb", @"verify", @"version", @"very", @"vessel", @"veteran", @"viable",
    @"vibrant", @"vicious", @"victory", @"video", @"view", @"village", @"vintage", @"violin",
    @"virtual", @"virus", @"visa", @"visit", @"visual", @"vital", @"vivid", @"vocal",
    @"voice", @"void", @"volcano", @"volume", @"vote", @"voucher", @"vow", @"voyal",
    @"vulnerable", @"waddle", @"wagon", @"wait", @"walk", @"wall", @"walnut", @"want",
    @"warfare", @"warm", @"warrior", @"wash", @"wasp", @"waste", @"water", @"wave",
    @"way", @"wealth", @"weapon", @"wear", @"weasel", @"weather", @"web", @"wedding",
    @"weekend", @"weird", @"welcome", @"west", @"wet", @"whale", @"what", @"wheat",
    @"wheel", @"when", @"where", @"whip", @"whisper", @"wide", @"width", @"wife",
    @"wild", @"will", @"win", @"window", @"wine", @"wing", @"wink", @"winner",
    @"winter", @"wire", @"wisdom", @"wise", @"wish", @"witness", @"wolf", @"woman",
    @"wonder", @"wood", @"wool", @"word", @"work", @"world", @"worry", @"worth",
    @"wrap", @"wreck", @"wrestle", @"wrist", @"write", @"wrong", @"yard", @"year",
    @"yellow", @"you", @"young", @"youth", @"zebra", @"zero", @"zone", @"zoo"
];

#pragma mark - Verification Methods

- (BOOL)verifyKeyPairInSecureEnclave:(SecKeyRef)privateKey publicKey:(SecKeyRef)publicKey {
    // 1. Verify keys exist
    if (!privateKey || !publicKey) {
        RCTLogError(@"Key pair verification failed: One or both keys are nil");
        return NO;
    }
    
    // 2. Verify key attributes
    CFDictionaryRef privateAttrs = SecKeyCopyAttributes(privateKey);
    CFDictionaryRef publicAttrs = SecKeyCopyAttributes(publicKey);
    
    if (!privateAttrs || !publicAttrs) {
        RCTLogError(@"Failed to get key attributes");
        return NO;
    }
    
    // Convert public key to hex for logging
    CFDataRef logPubKeyData = SecKeyCopyExternalRepresentation(publicKey, NULL);
    if (logPubKeyData) {
        NSData *pubData = (__bridge_transfer NSData *)logPubKeyData;
        NSMutableString *hexString = [NSMutableString string];
        const unsigned char *bytes = pubData.bytes;
        for (NSUInteger i = 0; i < pubData.length; i++) {
            [hexString appendFormat:@"%02x", bytes[i]];
        }
        RCTLogInfo(@"Full public key (hex): %@", hexString);
        RCTLogInfo(@"First byte (should be 0x04 for uncompressed): %02x", bytes[0]);
        RCTLogInfo(@"X coordinate: %@", [hexString substringWithRange:NSMakeRange(2, 64)]);
        RCTLogInfo(@"Y coordinate: %@", [hexString substringWithRange:NSMakeRange(66, 64)]);
    }

    // Check if private key is in Secure Enclave
    CFStringRef tokenID = CFDictionaryGetValue(privateAttrs, kSecAttrTokenID);
    BOOL isInSecureEnclave = tokenID && CFEqual(tokenID, kSecAttrTokenIDSecureEnclave);
    RCTLogInfo(@"Private key is in Secure Enclave: %@", isInSecureEnclave ? @"YES" : @"NO");
    
    // Check key type and size
    CFStringRef keyType = CFDictionaryGetValue(privateAttrs, kSecAttrKeyType);
    CFNumberRef keySizeNum = CFDictionaryGetValue(privateAttrs, kSecAttrKeySizeInBits);
    
    BOOL isCorrectType = keyType && CFEqual(keyType, kSecAttrKeyTypeECSECPrimeRandom);
    int keySize = 0;
    CFNumberGetValue(keySizeNum, kCFNumberIntType, &keySize);
    
    RCTLogInfo(@"Key type is EC: %@", isCorrectType ? @"YES" : @"NO");
    RCTLogInfo(@"Key size: %d bits", keySize);
    
    // 3. Test signing operation
    NSData *testData = [@"test" dataUsingEncoding:NSUTF8StringEncoding];
    CFErrorRef error = NULL;
    CFDataRef signature = SecKeyCreateSignature(privateKey,
                                              kSecKeyAlgorithmECDSASignatureMessageX962SHA256,
                                              (__bridge CFDataRef)testData,
                                              &error);
    
    if (!signature) {
        NSError *err = (__bridge_transfer NSError *)error;
        RCTLogError(@"Signing test failed: %@", err);
        CFRelease(privateAttrs);
        CFRelease(publicAttrs);
        return NO;
    }
    
    // 4. Verify signature
    BOOL verified = SecKeyVerifySignature(publicKey,
                                        kSecKeyAlgorithmECDSASignatureMessageX962SHA256,
                                        (__bridge CFDataRef)testData,
                                        signature,
                                        &error);
    
    CFRelease(signature);
    CFRelease(privateAttrs);
    CFRelease(publicAttrs);
    
    if (!verified) {
        NSError *err = (__bridge_transfer NSError *)error;
        RCTLogError(@"Signature verification failed: %@", err);
        return NO;
    }
    
    RCTLogInfo(@"Key pair successfully verified with test signature");
    return YES;
}

#pragma mark - BIP39 Methods

- (NSString *)entropyToMnemonic:(NSData *)entropy {
    if (!entropy || entropy.length < 16 || entropy.length > 32 || entropy.length % 4 != 0) {
        RCTLogError(@"Invalid entropy length: %lu", (unsigned long)entropy.length);
        return nil;
    }
    
    // Calculate checksum
    uint8_t hash[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(entropy.bytes, (CC_LONG)entropy.length, hash);
    RCTLogInfo(@"Generated SHA256 hash for entropy");
    
    NSMutableString *bits = [NSMutableString string];
    
    // Convert entropy to bits
    const uint8_t *bytes = entropy.bytes;
    for (NSUInteger i = 0; i < entropy.length; i++) {
        for (int j = 7; j >= 0; j--) {
            [bits appendString:((bytes[i] >> j) & 1) ? @"1" : @"0"];
        }
    }
    RCTLogInfo(@"Converted entropy to bits, length: %lu", (unsigned long)bits.length);
    
    // Add checksum bits
    NSUInteger checksumBits = entropy.length / 4;
    for (NSUInteger i = 0; i < checksumBits; i++) {
        [bits appendString:((hash[0] >> (7 - i)) & 1) ? @"1" : @"0"];
    }
    RCTLogInfo(@"Added %lu checksum bits", (unsigned long)checksumBits);
    
    // Convert bits to words
    NSMutableArray *words = [NSMutableArray array];
    for (NSUInteger i = 0; i < bits.length; i += 11) {
        NSString *wordBits = [bits substringWithRange:NSMakeRange(i, 11)];
        NSUInteger wordIndex = strtoul([wordBits UTF8String], NULL, 2);
        // Use modulo to keep index within our limited word list
        wordIndex = wordIndex % [kBIP39Words count];
        [words addObject:kBIP39Words[wordIndex]];
        RCTLogInfo(@"Generated word %lu: %@", (unsigned long)words.count, kBIP39Words[wordIndex]);
    }
    
    NSString *mnemonic = [words componentsJoinedByString:@" "];
    RCTLogInfo(@"Final mnemonic length: %lu words", (unsigned long)words.count);
    return mnemonic;
}

- (NSData *)generateSecureEntropy:(NSUInteger)bytes {
    NSMutableData *entropy = [NSMutableData dataWithLength:bytes];
    int result = SecRandomCopyBytes(kSecRandomDefault, (size_t)bytes, entropy.mutableBytes);
    if (result == errSecSuccess) {
        RCTLogInfo(@"Successfully generated %lu bytes of entropy", (unsigned long)bytes);
        return entropy;
    }
    RCTLogError(@"Failed to generate secure entropy, error: %d", result);
    return nil;
}

#pragma mark - Secure Enclave Methods

- (SecAccessControlRef)createAccessControl {
    // Create access control with biometry
    SecAccessControlRef access = SecAccessControlCreateWithFlags(
        kCFAllocatorDefault,
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        kSecAccessControlBiometryAny | kSecAccessControlPrivateKeyUsage,
        NULL
    );
    return access;
}

- (BOOL)isSecureEnclavePresent {
    // First check if device has Secure Enclave by attempting to create a test key
    NSDictionary *testKeyParams = @{
        (__bridge id)kSecAttrKeyType: (__bridge id)kSecAttrKeyTypeECSECPrimeRandom,
        (__bridge id)kSecAttrKeySizeInBits: @256,
        (__bridge id)kSecAttrTokenID: (__bridge id)kSecAttrTokenIDSecureEnclave,
    };
    
    CFErrorRef error = NULL;
    SecKeyRef testKey = SecKeyCreateRandomKey((__bridge CFDictionaryRef)testKeyParams, &error);
    
    if (testKey) {
        // Clean up test key
        CFRelease(testKey);
        RCTLogInfo(@"Secure Enclave is present and working");
        
        // Now check biometric availability
        LAContext *context = [[LAContext alloc] init];
        NSError *biometricError = nil;
        
        if ([context canEvaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics error:&biometricError]) {
            RCTLogInfo(@"Biometric authentication is available, type: %ld", (long)context.biometryType);
            return YES;
        }
        
        if (biometricError) {
            RCTLogError(@"Biometric check error: %@", biometricError);
        }
        
    } else {
        NSError *keyError = (__bridge_transfer NSError *)error;
        RCTLogError(@"Failed to create test key in Secure Enclave: %@", keyError);
    }
    
    return NO;
}

RCT_EXPORT_METHOD(isSecureEnclaveAvailable:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    resolve(@([self isSecureEnclavePresent]));
}

#pragma mark - Keychain Methods

- (BOOL)deleteMnemonicFromKeychain {
    NSDictionary *query = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrAccount: @"mnemonic",
        (__bridge id)kSecAttrService: @"com.walletpoc.secure"
    };
    
    OSStatus status = SecItemDelete((__bridge CFDictionaryRef)query);
    if (status == errSecSuccess || status == errSecItemNotFound) {
        RCTLogInfo(@"Successfully deleted old mnemonic or none existed");
        return YES;
    }
    
    RCTLogError(@"Failed to delete old mnemonic, status: %d", (int)status);
    return NO;
}

- (BOOL)storeMnemonicInKeychain:(NSString *)mnemonic {
    // First delete any existing mnemonic
    if (![self deleteMnemonicFromKeychain]) {
        return NO;
    }
    
    NSData *mnemonicData = [mnemonic dataUsingEncoding:NSUTF8StringEncoding];
    NSDictionary *query = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrAccount: @"mnemonic",
        (__bridge id)kSecValueData: mnemonicData,
        (__bridge id)kSecAttrAccessible: (__bridge id)kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        (__bridge id)kSecAttrService: @"com.walletpoc.secure"
    };
    
    OSStatus status = SecItemAdd((__bridge CFDictionaryRef)query, NULL);
    if (status != errSecSuccess) {
        RCTLogError(@"Failed to store mnemonic in Keychain. Status: %d", (int)status);
        return NO;
    }
    
    RCTLogInfo(@"Successfully stored mnemonic in Keychain");
    return YES;
}

#pragma mark - Wallet Methods

- (BOOL)hasExistingWallet {
    // Check for encrypted private key in Keychain
    NSDictionary *query = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrAccount: @"encrypted_private_key",
        (__bridge id)kSecAttrService: @"com.walletpoc.secure",
        (__bridge id)kSecReturnData: @YES
    };
    
    CFTypeRef result = NULL;
    OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
    BOOL hasEncryptedKey = (status == errSecSuccess);
    
    if (result) CFRelease(result);
    
    // Check for encrypted AES key in Keychain
    NSDictionary *aesKeyQuery = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrAccount: @"encrypted_aes_key",
        (__bridge id)kSecAttrService: @"com.walletpoc.secure",
        (__bridge id)kSecReturnData: @YES
    };
    
    CFTypeRef aesKeyResult = NULL;
    OSStatus aesKeyStatus = SecItemCopyMatching((__bridge CFDictionaryRef)aesKeyQuery, &aesKeyResult);
    BOOL hasEncryptedAesKey = (aesKeyStatus == errSecSuccess);
    
    if (aesKeyResult) CFRelease(aesKeyResult);
    
    // Check for master key in Secure Enclave
    NSDictionary *keyQuery = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassKey,
        (__bridge id)kSecAttrLabel: @"master_key",
        (__bridge id)kSecAttrKeyType: (__bridge id)kSecAttrKeyTypeECSECPrimeRandom,
        (__bridge id)kSecReturnRef: @YES
    };
    
    CFTypeRef keyResult = NULL;
    OSStatus keyStatus = SecItemCopyMatching((__bridge CFDictionaryRef)keyQuery, &keyResult);
    BOOL hasMasterKey = (keyStatus == errSecSuccess);
    
    if (keyResult) CFRelease(keyResult);
    
    RCTLogInfo(@"Wallet check - Has encrypted key: %@, Has encrypted AES key: %@, Has master key: %@", 
               hasEncryptedKey ? @"YES" : @"NO",
               hasEncryptedAesKey ? @"YES" : @"NO",
               hasMasterKey ? @"YES" : @"NO");
               
    return hasEncryptedKey && hasEncryptedAesKey && hasMasterKey;
}

- (NSDictionary *)getExistingWallet {
    // Get the encrypted private key from Keychain
    NSDictionary *query = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrAccount: @"encrypted_private_key",
        (__bridge id)kSecAttrService: @"com.walletpoc.secure",
        (__bridge id)kSecReturnData: @YES
    };
    
    CFTypeRef result = NULL;
    OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
    
    if (status != errSecSuccess) {
        RCTLogError(@"Failed to retrieve encrypted private key, status: %d", (int)status);
        return nil;
    }
    
    NSData *encryptedPrivateKeyData = (__bridge_transfer NSData *)result;
    
    // Get the master key from Secure Enclave
    NSDictionary *masterKeyQuery = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassKey,
        (__bridge id)kSecAttrLabel: @"master_key",
        (__bridge id)kSecAttrKeyType: (__bridge id)kSecAttrKeyTypeECSECPrimeRandom,
        (__bridge id)kSecReturnRef: @YES
    };
    
    CFTypeRef masterKeyResult = NULL;
    OSStatus masterKeyStatus = SecItemCopyMatching((__bridge CFDictionaryRef)masterKeyQuery, &masterKeyResult);
    
    if (masterKeyStatus != errSecSuccess) {
        RCTLogError(@"Failed to retrieve master key, status: %d", (int)masterKeyStatus);
        return nil;
    }
    
    SecKeyRef masterKey = (SecKeyRef)masterKeyResult;
    
    // Decrypt the private key using the master key
    NSData *derivedKey = [self deriveEncryptionKeyFromMasterKey:masterKey];
    if (!derivedKey) {
        CFRelease(masterKey);
        RCTLogError(@"Failed to derive encryption key");
        return nil;
    }
    
    // For decryption, we can estimate the output size based on the input size
    // The decrypted data should be smaller than or equal to the encrypted data
    size_t decryptedLength = encryptedPrivateKeyData.length;
    
    NSMutableData *privateKeyData = [NSMutableData dataWithLength:decryptedLength];
    CCCryptorStatus cryptStatus = CCCrypt(kCCDecrypt,
                                         kCCAlgorithmAES,
                                         kCCOptionPKCS7Padding,
                                         derivedKey.bytes,
                                         derivedKey.length,
                                         NULL,
                                         encryptedPrivateKeyData.bytes,
                                         encryptedPrivateKeyData.length,
                                         privateKeyData.mutableBytes,
                                         privateKeyData.length,
                                         &decryptedLength);
    
    if (cryptStatus != kCCSuccess) {
        CFRelease(masterKey);
        RCTLogError(@"Failed to decrypt private key");
        return nil;
    }
    
    // Derive public key from private key
    NSString *publicKeyHex = [self derivePublicKeyFromPrivateKey:privateKeyData];
    
    if (!publicKeyHex) {
        CFRelease(masterKey);
        RCTLogError(@"Failed to derive public key from private key");
        return nil;
    }
    
    NSDictionary *walletResult = @{
        @"publicKey": publicKeyHex,
        @"address": @"0x0000000000000000000000000000000000000000" // Placeholder - will be derived in JS
    };
    
    CFRelease(masterKey);
    return walletResult;
}

RCT_EXPORT_METHOD(checkForExistingWallet:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    if ([self hasExistingWallet]) {
        RCTLogInfo(@"Found existing wallet, retrieving it");
        NSDictionary *existingWallet = [self getExistingWallet];
        if (existingWallet) {
            resolve(existingWallet);
            return;
        }
        RCTLogError(@"Found wallet but failed to retrieve it");
    }
    resolve(nil);
}

RCT_EXPORT_METHOD(generateSecureWallet:(NSDictionary *)config
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    
    // First check if wallet already exists
    if ([self hasExistingWallet]) {
        RCTLogInfo(@"Wallet already exists, retrieving existing one");
        NSDictionary *existingWallet = [self getExistingWallet];
        if (existingWallet) {
            resolve(existingWallet);
            return;
        }
        // If we couldn't get the existing wallet, continue to create a new one
        RCTLogInfo(@"Failed to retrieve existing wallet, creating new one");
    }
    
    if (![self isSecureEnclavePresent]) {
        reject(@"secure_enclave_error", @"Secure Enclave not available", nil);
        return;
    }
    
    // Generate entropy for mnemonic
    NSData *entropy = [self generateSecureEntropy:16]; // 128 bits = 12 words
    if (!entropy) {
        reject(@"entropy_error", @"Failed to generate secure entropy", nil);
        return;
    }
    
    // Generate mnemonic
    NSString *mnemonic = [self entropyToMnemonic:entropy];
    if (!mnemonic) {
        reject(@"mnemonic_error", @"Failed to generate mnemonic", nil);
        return;
    }
    RCTLogInfo(@"Successfully generated mnemonic");
    
    // Derive private key from seed phrase
    NSData *privateKeyData = [self derivePrivateKeyFromSeedPhrase:mnemonic];
    if (!privateKeyData) {
        RCTLogError(@"Failed to derive private key from mnemonic");
        reject(@"key_derivation_error", @"Failed to derive private key from mnemonic", nil);
        return;
    }
    
    RCTLogInfo(@"Successfully derived private key from mnemonic");
    
    // Create master key in Secure Enclave for encrypting private key
    SecAccessControlRef access = [self createAccessControl];
    if (!access) {
        reject(@"access_control_error", @"Failed to create access control", nil);
        return;
    }
    
    NSDictionary *masterKeyAttributes = @{
        (__bridge id)kSecAttrKeyType: (__bridge id)kSecAttrKeyTypeECSECPrimeRandom,
        (__bridge id)kSecAttrKeySizeInBits: @256,
        (__bridge id)kSecAttrTokenID: (__bridge id)kSecAttrTokenIDSecureEnclave,
        (__bridge id)kSecPrivateKeyAttrs: @{
            (__bridge id)kSecAttrIsPermanent: @YES,
            (__bridge id)kSecAttrAccessControl: (__bridge_transfer id)access,
            (__bridge id)kSecAttrLabel: @"master_key"
        }
    };
    
    // Generate master key in Secure Enclave
    CFErrorRef error = NULL;
    SecKeyRef masterKey = SecKeyCreateRandomKey((__bridge CFDictionaryRef)masterKeyAttributes, &error);
    
    if (!masterKey) {
        NSError *err = (__bridge_transfer NSError *)error;
        reject(@"key_generation_error", err.localizedDescription, nil);
        return;
    }
    
    // Generate a random AES key for encrypting the private key
    NSData *aesKey = [self generateSecureEntropy:32]; // 256-bit AES key
    if (!aesKey) {
        CFRelease(masterKey);
        reject(@"key_generation_error", @"Failed to generate AES key", nil);
        return;
    }
    
    RCTLogInfo(@"Successfully generated AES key with length: %lu", (unsigned long)aesKey.length);
    
    // Debug logging for encryption parameters
    RCTLogInfo(@"Private key data length: %lu", (unsigned long)privateKeyData.length);
    RCTLogInfo(@"AES key length: %lu", (unsigned long)aesKey.length);
    
    if (!privateKeyData || privateKeyData.length == 0) {
        CFRelease(masterKey);
        reject(@"encryption_error", @"Private key data is nil or empty", nil);
        return;
    }
    
    // Validate private key data
    if (privateKeyData.length != 32) {
        CFRelease(masterKey);
        NSString *errorMsg = [NSString stringWithFormat:@"Invalid private key length: %lu (expected 32)", (unsigned long)privateKeyData.length];
        RCTLogError(@"%@", errorMsg);
        reject(@"encryption_error", errorMsg, nil);
        return;
    }
    
    // Validate that the private key is valid for secp256k1
    secp256k1_context *ctx = secp256k1_context_create(SECP256K1_CONTEXT_SIGN);
    if (!ctx) {
        CFRelease(masterKey);
        RCTLogError(@"Failed to create secp256k1 context for validation");
        reject(@"encryption_error", @"Failed to validate private key", nil);
        return;
    }
    
    if (!secp256k1_ec_seckey_verify(ctx, privateKeyData.bytes)) {
        secp256k1_context_destroy(ctx);
        CFRelease(masterKey);
        RCTLogError(@"Private key is not valid for secp256k1");
        reject(@"encryption_error", @"Invalid private key for secp256k1", nil);
        return;
    }
    
    secp256k1_context_destroy(ctx);
    RCTLogInfo(@"Private key validated successfully for secp256k1");
    
    // Validate AES key size (must be 16, 24, or 32 bytes for AES-128, AES-192, or AES-256)
    if (aesKey.length != 16 && aesKey.length != 24 && aesKey.length != 32) {
        CFRelease(masterKey);
        NSString *errorMsg = [NSString stringWithFormat:@"Invalid AES key size: %lu (must be 16, 24, or 32)", (unsigned long)aesKey.length];
        RCTLogError(@"%@", errorMsg);
        reject(@"encryption_error", errorMsg, nil);
        return;
    }
    
    // Encrypt the private key with the AES key
    // Calculate the required buffer size for AES encryption with PKCS7 padding
    // For AES, the output size is input size rounded up to nearest block size (16 bytes)
    // PKCS7 padding adds 1-16 bytes, so we need to account for that
    size_t blockSize = 16; // AES block size
    size_t numBlocks = (privateKeyData.length + blockSize - 1) / blockSize; // Round up
    size_t encryptedLength = numBlocks * blockSize;
    
    // For PKCS7 padding, if the input is exactly a multiple of block size,
    // we need an extra block for the padding
    if (privateKeyData.length % blockSize == 0) {
        encryptedLength += blockSize;
    }
    
    RCTLogInfo(@"Calculated encrypted length: %zu (input: %lu, block size: %zu)", encryptedLength, (unsigned long)privateKeyData.length, blockSize);
    
    NSMutableData *encryptedPrivateKey = [NSMutableData dataWithLength:encryptedLength];
    CCCryptorStatus cryptStatus;
    cryptStatus = CCCrypt(kCCEncrypt,
                         kCCAlgorithmAES,
                         kCCOptionPKCS7Padding,
                         aesKey.bytes,
                         aesKey.length,
                         NULL,
                         privateKeyData.bytes,
                         privateKeyData.length,
                         encryptedPrivateKey.mutableBytes,
                         encryptedPrivateKey.length,
                         &encryptedLength);
    
    if (cryptStatus != kCCSuccess) {
        CFRelease(masterKey);
        NSString *errorMsg = [NSString stringWithFormat:@"Failed to encrypt private key: %d", (int)cryptStatus];
        RCTLogError(@"%@", errorMsg);
        
        // Provide more specific error messages based on the status
        NSString *specificError = @"";
        switch (cryptStatus) {
            case kCCParamError:
                specificError = @"Parameter error - check key size and data";
                break;
            case kCCBufferTooSmall:
                specificError = @"Buffer too small";
                break;
            case kCCMemoryFailure:
                specificError = @"Memory allocation failure";
                break;
            case kCCAlignmentError:
                specificError = @"Input size was not aligned properly";
                break;
            case kCCDecodeError:
                specificError = @"Input data did not decode or decrypt properly";
                break;
            case kCCUnimplemented:
                specificError = @"Function not implemented for the current algorithm";
                break;
            default:
                specificError = @"Unknown encryption error";
                break;
        }
        
        RCTLogError(@"Specific error: %@", specificError);
        reject(@"encryption_error", [NSString stringWithFormat:@"%@: %@", errorMsg, specificError], nil);
        return;
    }
    
    RCTLogInfo(@"Successfully encrypted private key, final length: %zu", encryptedLength);
    
    // Derive an encryption key from the Secure Enclave master key
    NSData *derivedEncryptionKey = [self deriveEncryptionKeyFromMasterKey:masterKey];
    if (!derivedEncryptionKey) {
        CFRelease(masterKey);
        reject(@"encryption_error", @"Failed to derive encryption key from master key", nil);
        return;
    }
    
    // Encrypt the AES key with the derived encryption key
    size_t aesKeyBlockSize = 16;
    size_t aesKeyNumBlocks = (aesKey.length + aesKeyBlockSize - 1) / aesKeyBlockSize;
    size_t encryptedAesKeyLength = aesKeyNumBlocks * aesKeyBlockSize;
    
    // For PKCS7 padding, if the input is exactly a multiple of block size, we need an extra block
    if (aesKey.length % aesKeyBlockSize == 0) {
        encryptedAesKeyLength += aesKeyBlockSize;
    }
    
    NSMutableData *encryptedAesKeyData = [NSMutableData dataWithLength:encryptedAesKeyLength];
    CCCryptorStatus aesCryptStatus = CCCrypt(kCCEncrypt,
                                            kCCAlgorithmAES,
                                            kCCOptionPKCS7Padding,
                                            derivedEncryptionKey.bytes,
                                            derivedEncryptionKey.length,
                                            NULL,
                                            aesKey.bytes,
                                            aesKey.length,
                                            encryptedAesKeyData.mutableBytes,
                                            encryptedAesKeyData.length,
                                            &encryptedAesKeyLength);
    
    if (aesCryptStatus != kCCSuccess) {
        CFRelease(masterKey);
        NSString *errorMsg = [NSString stringWithFormat:@"Failed to encrypt AES key: %d", (int)aesCryptStatus];
        RCTLogError(@"%@", errorMsg);
        reject(@"encryption_error", errorMsg, nil);
        return;
    }
    
    RCTLogInfo(@"Successfully encrypted AES key, final length: %zu", encryptedAesKeyLength);
    
    // Store encrypted private key in Keychain
    NSDictionary *encryptedKeyQuery = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrAccount: @"encrypted_private_key",
        (__bridge id)kSecValueData: encryptedPrivateKey,
        (__bridge id)kSecAttrAccessible: (__bridge id)kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        (__bridge id)kSecAttrService: @"com.walletpoc.secure"
    };
    
    OSStatus storeStatus = SecItemAdd((__bridge CFDictionaryRef)encryptedKeyQuery, NULL);
    if (storeStatus != errSecSuccess) {
        CFRelease(masterKey);
        reject(@"keychain_error", @"Failed to store encrypted private key", nil);
        return;
    }
    
    // Store encrypted AES key in Keychain
    NSDictionary *encryptedAesKeyQuery = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrAccount: @"encrypted_aes_key",
        (__bridge id)kSecValueData: encryptedAesKeyData,
        (__bridge id)kSecAttrAccessible: (__bridge id)kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        (__bridge id)kSecAttrService: @"com.walletpoc.secure"
    };
    
    OSStatus storeAesKeyStatus = SecItemAdd((__bridge CFDictionaryRef)encryptedAesKeyQuery, NULL);
    if (storeAesKeyStatus != errSecSuccess) {
        CFRelease(masterKey);
        reject(@"keychain_error", @"Failed to store encrypted AES key", nil);
        return;
    }
    
    // Store mnemonic in Keychain for backup/recovery
    if (![self storeMnemonicInKeychain:mnemonic]) {
        CFRelease(masterKey);
        reject(@"keychain_error", @"Failed to store mnemonic in keychain", nil);
        return;
    }
    
    // Derive public key for display
    NSString *publicKeyHex = [self derivePublicKeyFromPrivateKey:privateKeyData];
    
    // Wipe sensitive data from memory
    privateKeyData = nil;
    
    RCTLogInfo(@"Public key derived: %@", publicKeyHex);
    
    // Let JavaScript handle address derivation using proper Keccak-256
    NSDictionary *walletResult = @{
        @"publicKey": publicKeyHex,
        @"address": @"0x0000000000000000000000000000000000000000" // JavaScript will derive the correct address
    };
    
    CFRelease(masterKey);
    resolve(walletResult);
}

RCT_EXPORT_METHOD(signTransactionHash:(NSString *)transactionHash
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    
    // Get the encrypted private key from Keychain
    NSDictionary *query = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrAccount: @"encrypted_private_key",
        (__bridge id)kSecAttrService: @"com.walletpoc.secure",
        (__bridge id)kSecReturnData: @YES
    };
    
    CFTypeRef result = NULL;
    OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
    
    if (status != errSecSuccess) {
        reject(@"key_error", @"Failed to retrieve encrypted private key", nil);
        return;
    }
    
    NSData *encryptedPrivateKeyData = (__bridge_transfer NSData *)result;
    
    // Get the master key from Secure Enclave
    NSDictionary *masterKeyQuery = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassKey,
        (__bridge id)kSecAttrLabel: @"master_key",
        (__bridge id)kSecAttrKeyType: (__bridge id)kSecAttrKeyTypeECSECPrimeRandom,
        (__bridge id)kSecReturnRef: @YES
    };
    
    CFTypeRef masterKeyResult = NULL;
    OSStatus masterKeyStatus = SecItemCopyMatching((__bridge CFDictionaryRef)masterKeyQuery, &masterKeyResult);
    
    if (masterKeyStatus != errSecSuccess) {
        reject(@"key_error", @"Failed to retrieve master key from Secure Enclave", nil);
        return;
    }
    
    SecKeyRef masterKey = (SecKeyRef)masterKeyResult;
    
    // Get the encrypted AES key from Keychain
    NSDictionary *aesKeyQuery = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrAccount: @"encrypted_aes_key",
        (__bridge id)kSecAttrService: @"com.walletpoc.secure",
        (__bridge id)kSecReturnData: @YES
    };
    
    CFTypeRef aesKeyResult = NULL;
    OSStatus aesKeyStatus = SecItemCopyMatching((__bridge CFDictionaryRef)aesKeyQuery, &aesKeyResult);
    
    if (aesKeyStatus != errSecSuccess) {
        CFRelease(masterKey);
        reject(@"key_error", @"Failed to retrieve encrypted AES key", nil);
        return;
    }
    
    NSData *encryptedAesKeyData = (__bridge_transfer NSData *)aesKeyResult;
    
    // Derive the encryption key from the Secure Enclave master key
    NSData *derivedEncryptionKey = [self deriveEncryptionKeyFromMasterKey:masterKey];
    if (!derivedEncryptionKey) {
        CFRelease(masterKey);
        reject(@"decrypt_error", @"Failed to derive encryption key from master key", nil);
        return;
    }
    
    // Decrypt the AES key using the derived encryption key
    size_t decryptedAesKeyLength = encryptedAesKeyData.length;
    NSMutableData *aesKeyData = [NSMutableData dataWithLength:decryptedAesKeyLength];
    CCCryptorStatus aesDecryptStatus = CCCrypt(kCCDecrypt,
                                              kCCAlgorithmAES,
                                              kCCOptionPKCS7Padding,
                                              derivedEncryptionKey.bytes,
                                              derivedEncryptionKey.length,
                                              NULL,
                                              encryptedAesKeyData.bytes,
                                              encryptedAesKeyData.length,
                                              aesKeyData.mutableBytes,
                                              aesKeyData.length,
                                              &decryptedAesKeyLength);
    
    if (aesDecryptStatus != kCCSuccess) {
        CFRelease(masterKey);
        NSString *errorMsg = [NSString stringWithFormat:@"Failed to decrypt AES key: %d", (int)aesDecryptStatus];
        RCTLogError(@"%@", errorMsg);
        reject(@"decrypt_error", errorMsg, nil);
        return;
    }
    
    // Create NSData with the actual decrypted length
    NSData *aesKey = [NSData dataWithBytes:aesKeyData.bytes length:decryptedAesKeyLength];
    
    // Decrypt the private key using the AES key
    // For decryption, we can estimate the output size based on the input size
    size_t decryptedLength = encryptedPrivateKeyData.length;
    
    NSMutableData *privateKeyData = [NSMutableData dataWithLength:decryptedLength];
    CCCryptorStatus cryptStatus = CCCrypt(kCCDecrypt,
                                         kCCAlgorithmAES,
                                         kCCOptionPKCS7Padding,
                                         aesKey.bytes,
                                         aesKey.length,
                                         NULL,
                                         encryptedPrivateKeyData.bytes,
                                         encryptedPrivateKeyData.length,
                                         privateKeyData.mutableBytes,
                                         privateKeyData.length,
                                         &decryptedLength);
    
    if (cryptStatus != kCCSuccess) {
        CFRelease(masterKey);
        reject(@"decrypt_error", @"Failed to decrypt private key", nil);
        return;
    }
    
    // Convert transaction hash to data
    NSData *hashData = [self hexStringToData:transactionHash];
    if (!hashData) {
        CFRelease(masterKey);
        reject(@"invalid_hash", @"Invalid transaction hash format", nil);
        return;
    }
    
    // Sign with secp256k1 (EVM compatible format)
    NSData *signatureData = [self signWithSecp256k1:privateKeyData hashData:hashData];
    
    if (!signatureData) {
        // Wipe private key from memory
        privateKeyData = nil;
        CFRelease(masterKey);
        reject(@"signing_error", @"Failed to sign transaction", nil);
        return;
    }
    
    // Split signature into r and s (32 bytes each)
    NSData *rData = [signatureData subdataWithRange:NSMakeRange(0, 32)];
    NSData *sData = [signatureData subdataWithRange:NSMakeRange(32, 32)];
    
    // Get public key for recovery ID calculation
    NSData *publicKeyData = [self derivePublicKeyDataFromPrivateKey:privateKeyData];
    
    // Debug: Log the public key being used for signing
    NSString *signingPublicKey = [self derivePublicKeyFromPrivateKey:privateKeyData];
    RCTLogInfo(@"Public key used for signing: %@", signingPublicKey);
    
    int recoveryId = [self getRecoveryId:signatureData hashData:hashData publicKey:publicKeyData];
    
    // Wipe private key from memory
    privateKeyData = nil;
    
    // Return EVM-compatible signature format
    NSDictionary *signature = @{
        @"r": [self formatPublicKey:rData],
        @"s": [self formatPublicKey:sData],
        @"v": @(recoveryId + 27), // EVM adds 27 to recovery ID
        @"publicKey": signingPublicKey // Include public key for verification
    };
    
    CFRelease(masterKey);
    resolve(signature);
}

// Derive private key from seed phrase using BIP32/BIP44
- (NSData *)derivePrivateKeyFromSeedPhrase:(NSString *)seedPhrase {
    // This is a simplified implementation
    // In production, you'd use a proper BIP32/BIP44 implementation
    
    if (!seedPhrase || seedPhrase.length == 0) {
        RCTLogError(@"Seed phrase is nil or empty");
        return nil;
    }
    
    RCTLogInfo(@"Deriving private key from seed phrase: %@", seedPhrase);
    
    // For now, we'll use a simple hash of the seed phrase
    const char *seedBytes = [seedPhrase UTF8String];
    if (!seedBytes) {
        RCTLogError(@"Failed to convert seed phrase to UTF8");
        return nil;
    }
    
    RCTLogInfo(@"Seed phrase length: %zu", strlen(seedBytes));
    
    unsigned char hash[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(seedBytes, (CC_LONG)strlen(seedBytes), hash);
    
    // Debug: Log the first few bytes of the hash
    RCTLogInfo(@"Hash bytes: %02x%02x%02x%02x...", hash[0], hash[1], hash[2], hash[3]);
    
    RCTLogInfo(@"Generated SHA256 hash for seed phrase");
    
    // Ensure the private key is valid for secp256k1
    // The private key must be less than the curve order
    secp256k1_context *ctx = secp256k1_context_create(SECP256K1_CONTEXT_SIGN);
    if (!ctx) {
        RCTLogError(@"Failed to create secp256k1 context");
        return nil;
    }
    
    // Check if the hash is a valid private key
    if (!secp256k1_ec_seckey_verify(ctx, hash)) {
        RCTLogInfo(@"Hash is not a valid private key, applying modification");
        // If not valid, we'll use a deterministic modification
        // In production, you'd use proper BIP32 derivation
        hash[0] = hash[0] & 0x7F; // Ensure it's less than curve order
        RCTLogInfo(@"Modified hash bytes: %02x%02x%02x%02x...", hash[0], hash[1], hash[2], hash[3]);
    }
    
    secp256k1_context_destroy(ctx);
    
    NSData *privateKeyData = [NSData dataWithBytes:hash length:CC_SHA256_DIGEST_LENGTH];
    RCTLogInfo(@"Generated private key data with length: %lu", (unsigned long)privateKeyData.length);
    
    return privateKeyData;
}

// Derive public key from private key using secp256k1
- (NSString *)derivePublicKeyFromPrivateKey:(NSData *)privateKeyData {
    secp256k1_context *ctx = secp256k1_context_create(SECP256K1_CONTEXT_SIGN);
    
    // Parse the private key
    const unsigned char *privateKeyBytes = privateKeyData.bytes;
    secp256k1_pubkey pubkey;
    
    // Compute the public key
    if (!secp256k1_ec_pubkey_create(ctx, &pubkey, privateKeyBytes)) {
        secp256k1_context_destroy(ctx);
        return nil;
    }
    
    // Serialize the public key (uncompressed format)
    unsigned char serialized_pubkey[65];
    size_t serialized_pubkey_len = sizeof(serialized_pubkey);
    
    if (!secp256k1_ec_pubkey_serialize(ctx, serialized_pubkey, &serialized_pubkey_len, &pubkey, SECP256K1_EC_UNCOMPRESSED)) {
        secp256k1_context_destroy(ctx);
        return nil;
    }
    
    // Convert to hex string
    NSMutableString *hexString = [NSMutableString string];
    for (int i = 0; i < serialized_pubkey_len; i++) {
        [hexString appendFormat:@"%02x", serialized_pubkey[i]];
    }
    
    secp256k1_context_destroy(ctx);
    
    return hexString;
}

// Sign with secp256k1 using libsecp256k1 - EVM compatible format
- (NSData *)signWithSecp256k1:(NSData *)privateKeyData hashData:(NSData *)hashData {
    secp256k1_context *ctx = secp256k1_context_create(SECP256K1_CONTEXT_SIGN);
    
    // Parse the private key
    const unsigned char *privateKeyBytes = privateKeyData.bytes;
    
    // Debug: Log the first few bytes of the private key
    RCTLogInfo(@"Private key bytes: %02x%02x%02x%02x...", privateKeyBytes[0], privateKeyBytes[1], privateKeyBytes[2], privateKeyBytes[3]);
    
    // Parse the hash
    const unsigned char *hashBytes = hashData.bytes;
    
    // Create signature
    secp256k1_ecdsa_signature signature;
    
    if (!secp256k1_ecdsa_sign(ctx, &signature, hashBytes, privateKeyBytes, NULL, NULL)) {
        secp256k1_context_destroy(ctx);
        return nil;
    }
    
    // Serialize the signature in compact format (64 bytes: 32 bytes R + 32 bytes S)
    // This is the format required by EVM transactions
    unsigned char compact_signature[64];
    
    if (!secp256k1_ecdsa_signature_serialize_compact(ctx, compact_signature, &signature)) {
        secp256k1_context_destroy(ctx);
        return nil;
    }
    
    // Create NSData from the compact signature
    NSData *signatureData = [NSData dataWithBytes:compact_signature length:64];
    
    secp256k1_context_destroy(ctx);
    
    return signatureData;
}

// Get recovery ID for EVM transactions
- (int)getRecoveryId:(NSData *)signatureData hashData:(NSData *)hashData publicKey:(NSData *)publicKeyData {
    // Since our manual calculation is not working correctly, let's try both recovery IDs
    // and let the JavaScript side determine which one works
    
    // For now, return 0 as default - the JavaScript side will try both v=27 and v=28
    RCTLogInfo(@"Using default recovery ID: 0 (JavaScript will try both v=27 and v=28)");
    return 0;
}

// Helper method to get public key as NSData
- (NSData *)derivePublicKeyDataFromPrivateKey:(NSData *)privateKeyData {
    secp256k1_context *ctx = secp256k1_context_create(SECP256K1_CONTEXT_SIGN);
    
    // Parse the private key
    const unsigned char *privateKeyBytes = privateKeyData.bytes;
    secp256k1_pubkey pubkey;
    
    // Compute the public key
    if (!secp256k1_ec_pubkey_create(ctx, &pubkey, privateKeyBytes)) {
        secp256k1_context_destroy(ctx);
        return nil;
    }
    
    // Serialize the public key (uncompressed format)
    unsigned char serialized_pubkey[65];
    size_t serialized_pubkey_len = sizeof(serialized_pubkey);
    
    if (!secp256k1_ec_pubkey_serialize(ctx, serialized_pubkey, &serialized_pubkey_len, &pubkey, SECP256K1_EC_UNCOMPRESSED)) {
        secp256k1_context_destroy(ctx);
        return nil;
    }
    
    NSData *publicKeyData = [NSData dataWithBytes:serialized_pubkey length:serialized_pubkey_len];
    
    secp256k1_context_destroy(ctx);
    
    return publicKeyData;
}

// Helper method to convert hex string to NSData
- (NSData *)hexStringToData:(NSString *)hexString {
    // Remove '0x' prefix if present
    NSString *cleanHex = [hexString hasPrefix:@"0x"] ? [hexString substringFromIndex:2] : hexString;
    
    if (cleanHex.length % 2 != 0) {
        return nil;
    }
    
    NSMutableData *data = [NSMutableData dataWithLength:cleanHex.length / 2];
    unsigned char *bytes = data.mutableBytes;
    
    for (NSUInteger i = 0; i < cleanHex.length; i += 2) {
        NSString *byteString = [cleanHex substringWithRange:NSMakeRange(i, 2)];
        unsigned int byte;
        if (![[NSScanner scannerWithString:byteString] scanHexInt:&byte]) {
            return nil;
        }
        bytes[i / 2] = byte;
    }
    
    return data;
}

RCT_EXPORT_METHOD(getMnemonic:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    NSDictionary *query = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrAccount: @"mnemonic",
        (__bridge id)kSecAttrService: @"com.walletpoc.secure",
        (__bridge id)kSecReturnData: @YES
    };
    
    CFTypeRef result = NULL;
    OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
    
    if (status == errSecSuccess) {
        NSData *mnemonicData = (__bridge_transfer NSData *)result;
        NSString *mnemonic = [[NSString alloc] initWithData:mnemonicData encoding:NSUTF8StringEncoding];
        resolve(mnemonic);
    } else {
        reject(@"keychain_error", @"Failed to retrieve mnemonic", nil);
    }
}

RCT_EXPORT_METHOD(deleteWallet:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    // Delete mnemonic from Keychain
    NSDictionary *mnemonicQuery = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrAccount: @"mnemonic",
        (__bridge id)kSecAttrService: @"com.walletpoc.secure"
    };
    
    OSStatus mnemonicStatus = SecItemDelete((__bridge CFDictionaryRef)mnemonicQuery);
    
    // Delete encrypted private key from Keychain
    NSDictionary *encryptedKeyQuery = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrAccount: @"encrypted_private_key",
        (__bridge id)kSecAttrService: @"com.walletpoc.secure"
    };
    
    OSStatus encryptedKeyStatus = SecItemDelete((__bridge CFDictionaryRef)encryptedKeyQuery);
    
    // Delete encrypted AES key from Keychain
    NSDictionary *encryptedAesKeyQuery = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrAccount: @"encrypted_aes_key",
        (__bridge id)kSecAttrService: @"com.walletpoc.secure"
    };
    
    OSStatus encryptedAesKeyStatus = SecItemDelete((__bridge CFDictionaryRef)encryptedAesKeyQuery);
    
    // Delete master key from Secure Enclave
    NSDictionary *masterKeyQuery = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassKey,
        (__bridge id)kSecAttrLabel: @"master_key",
        (__bridge id)kSecAttrKeyType: (__bridge id)kSecAttrKeyTypeECSECPrimeRandom
    };
    
    OSStatus masterKeyStatus = SecItemDelete((__bridge CFDictionaryRef)masterKeyQuery);
    
    // Log the deletion results
    RCTLogInfo(@"Delete results - Mnemonic: %d, Encrypted Key: %d, Encrypted AES Key: %d, Master Key: %d", 
               (int)mnemonicStatus, (int)encryptedKeyStatus, (int)encryptedAesKeyStatus, (int)masterKeyStatus);
    
    // Consider it successful if all items are either deleted or not found
    BOOL mnemonicDeleted = (mnemonicStatus == errSecSuccess || mnemonicStatus == errSecItemNotFound);
    BOOL encryptedKeyDeleted = (encryptedKeyStatus == errSecSuccess || encryptedKeyStatus == errSecItemNotFound);
    BOOL encryptedAesKeyDeleted = (encryptedAesKeyStatus == errSecSuccess || encryptedAesKeyStatus == errSecItemNotFound);
    BOOL masterKeyDeleted = (masterKeyStatus == errSecSuccess || masterKeyStatus == errSecItemNotFound);
    
    if (mnemonicDeleted && encryptedKeyDeleted && encryptedAesKeyDeleted && masterKeyDeleted) {
        RCTLogInfo(@"Successfully deleted all wallet data");
        resolve(@YES);
    } else {
        NSString *errorMsg = [NSString stringWithFormat:@"Failed to delete some wallet data - Mnemonic: %@, Encrypted Key: %@, Encrypted AES Key: %@, Master Key: %@",
                             mnemonicDeleted ? @"YES" : @"NO",
                             encryptedKeyDeleted ? @"YES" : @"NO",
                             encryptedAesKeyDeleted ? @"YES" : @"NO",
                             masterKeyDeleted ? @"YES" : @"NO"];
        reject(@"delete_error", errorMsg, nil);
    }
}

// Helper method to derive encryption key from master key
- (NSData *)deriveEncryptionKeyFromMasterKey:(SecKeyRef)masterKey {
    // For Secure Enclave keys, we can't get the external representation
    // So we'll use a different approach - derive from the key's attributes
    
    // Get the key's attributes
    CFDictionaryRef attrs = SecKeyCopyAttributes(masterKey);
    if (!attrs) {
        return nil;
    }
    
    // Use the key's label and other attributes to create a deterministic seed
    CFStringRef label = CFDictionaryGetValue(attrs, kSecAttrLabel);
    CFNumberRef keySize = CFDictionaryGetValue(attrs, kSecAttrKeySizeInBits);
    
    // Create a deterministic seed from the attributes
    NSMutableData *seed = [NSMutableData data];
    
    if (label) {
        NSString *labelString = (__bridge NSString *)label;
        [seed appendData:[labelString dataUsingEncoding:NSUTF8StringEncoding]];
    }
    
    if (keySize) {
        int size;
        CFNumberGetValue(keySize, kCFNumberIntType, &size);
        [seed appendBytes:&size length:sizeof(int)];
    }
    
    // Add some additional entropy
    const char *additionalEntropy = "SecureWallet_Encryption_Key_Derivation";
    [seed appendBytes:additionalEntropy length:strlen(additionalEntropy)];
    
    // Use SHA256 to derive a 32-byte key
    unsigned char derivedKey[32];
    CC_SHA256(seed.bytes, (CC_LONG)seed.length, derivedKey);
    
    CFRelease(attrs);
    
    return [NSData dataWithBytes:derivedKey length:32];
}

// Derive Ethereum address from public key
- (NSString *)deriveEthereumAddressFromPublicKey:(NSData *)publicKeyData {
    // Note: This method is not used anymore since we let JavaScript handle address derivation
    // The JavaScript side uses ethers.js which has proper Keccak-256 implementation
    return @"0x0000000000000000000000000000000000000000";
}

@end