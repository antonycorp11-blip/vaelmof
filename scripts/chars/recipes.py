"""Receitas dos personagens de Vaelmor (peças LPC por nome de definição).

Cada bioma tem o seu povo, com roupas, cores, armas e até raça próprios, e
quatro escalões (recruta → veterano → elite → campeão). O jogador tem a sua
própria linha (o clã), o herói tem um traje por armadura, e há mercadores e
coletores de trabalho com ferramentas.
"""


def P(name, **o):
    return (name, o)


# ------------------------------------------------------------------ gente
HEADS = {
    'human': ('head/heads/human/heads_human_male', 'head/heads/human/heads_human_female'),
    'plump': ('head/heads/human/heads_human_male_plump', 'head/heads/human/heads_human_female'),
    'elder': ('head/heads/human/heads_human_male_elderly', 'head/heads/human/heads_human_female_elderly'),
    'gaunt': ('head/heads/human/heads_human_male_gaunt', 'head/heads/human/heads_human_female'),
    'orc': ('head/heads/fantasy/heads_orc_male', 'head/heads/fantasy/heads_orc_female'),
    'lizard': ('head/heads/reptile/heads_lizard_male', 'head/heads/reptile/heads_lizard_female'),
    'goblin': ('head/heads/fantasy/heads_goblin', 'head/heads/fantasy/heads_goblin'),
}
HUMANISH = ('human', 'plump', 'elder', 'gaunt')


def person(sex='male', skin='light', head='human', hair=None, hairc='dark_brown', beard=None, eyes='brown', ears=None):
    """Corpo + cabeça (+ nariz, sobrancelhas, cabelo, barba). Devolve (tipo de corpo, peças)."""
    body = 'female' if sex == 'female' else 'male'
    hd = HEADS[head][1 if sex == 'female' else 0]
    parts = [P('body/body', color=skin), P(hd, color=skin, color_1=skin, color_2=eyes)]
    if head in HUMANISH:
        parts.append(P('head/nose/head_nose_straight', color=skin))
        parts.append(P('head/eyebrows/eyebrows_thick', color=hairc))
    if ears:
        parts.append(P('head/ears/' + ears, color=skin))
    if hair:
        parts.append(P('hair/' + hair, color=hairc))
    if beard:
        parts.append(P('hair/' + beard, color=hairc))
    return body, parts


def strip_hair(parts):
    """Elmos fechados: tira o cabelo (a barba fica)."""
    return [p for p in parts if not (p[0].startswith('hair/') and 'beards' not in p[0] and 'mustaches' not in p[0])]


# atalhos de roupa
def shirt(c, kind='longsleeve/torso_clothes_longsleeve'):
    return P('torso/shirts/' + kind, color=c)


def pants(c, kind='pants/legs_pants'):
    return P('legs/' + kind, color=c)


def boots(c, kind='boots/feet_boots_basic'):
    return P('feet/' + kind, color=c)


def belt(v='brown'):
    return P('torso/waist/belt_leather', variant=v)


BELT_METAL = {'brown': 'bronze', 'walnut': 'copper', 'black': 'iron', 'charcoal': 'iron', 'gray': 'steel', 'leather': 'brass'}


def leather(c='leather', belt_c='brown'):
    """Couraça de couro (a fivela do cinto é de metal)."""
    return P('torso/armour/torso_armour_leather', color_1=c, color_2=BELT_METAL.get(belt_c, belt_c))


def helm(name, metal='steel', c2='brown', **o):
    return P('headwear/helmets/helmets/hat_helmet_' + name, color=metal, color_1=metal, color_2=c2, **o)


def visor(name, metal='steel'):
    return P('headwear/helmets/visors/hat_visor_' + name, color=metal)


def acc(name, c):
    return P('headwear/helmets/accessories/hat_accessory_' + name, color=c, color_1=c, color_2=c)


def cape(c, kind='solid'):
    return P('torso/cape/cape_' + kind, color=c)


def plate(m):
    return [P('torso/armour/torso_armour_plate', color=m), P('arms/arms_armour', color=m), P('legs/legs_armour', color=m), P('feet/feet_armour', color=m)]


def tabard(v):
    return P('torso/jacket/torso_jacket_tabard', variant=v)


def hood(c):
    return P('headwear/coverings/hoods/hat_hood_cloth', color=c)


# ------------------------------------------------------------------ armas
# id → (classe, nome, peças)
def W(cls, name, *parts):
    return {'class': cls, 'name': name, 'parts': list(parts)}


def arming(m):
    return P('weapons/sword/weapon_sword_arming', variant=m)


def staff(kind, v):
    return P(f'weapons/magic/weapon_magic_{kind}', variant=v)


def bow(kind, v):
    return P(f'weapons/ranged/bow/weapon_ranged_bow_{kind}', variant=v)


WEAPON_LOOKS = {
    # base de cada classe
    'sword': W('sword', 'Espada', arming('iron')),
    'greatsword': W('greatsword', 'Montante', P('weapons/sword/weapon_sword_longsword', variant='longsword')),
    'staff': W('staff', 'Cajado', staff('gnarled', 'medium')),
    'bow': W('bow', 'Arco', bow('normal', 'medium')),
    # espadas e afins (uma mão)
    'w_temperada': W('sword', 'Espada Temperada', arming('steel')),
    'w_gladio': W('sword', 'Gládio do Vale', arming('bronze')),
    'w_runica': W('sword', 'Lâmina Rúnica', P('weapons/sword/weapon_sword_saber', variant='saber')),
    'w_geada': W('sword', 'Espada da Geada', P('weapons/sword/weapon_sword_rapier', variant='rapier')),
    'w_aurora': W('sword', 'Fio da Aurora', P('weapons/sword/weapon_sword_scimitar', variant='scimitar')),
    'w_brakk': W('sword', 'Presa de Brakk', P('weapons/blunt/weapon_blunt_mace', variant='mace')),
    'w_estelar': W('sword', 'Ceifadora Estelar', P('weapons/sword/weapon_sword_glowsword', variant='blue')),
    'w_juramento': W('sword', 'Juramento de Vaelmor', P('weapons/sword/weapon_sword_glowsword', variant='red')),
    # montantes, machados e hastes (duas mãos)
    'g_temperado': W('greatsword', 'Montante Temperado', P('weapons/sword/weapon_sword_longsword', variant='longsword')),
    'g_quebra': W('greatsword', 'Quebra-Elmos', P('weapons/blunt/weapon_blunt_waraxe', variant='waraxe')),
    'g_runico': W('greatsword', 'Montante Rúnico', P('weapons/polearm/weapon_polearm_halberd', variant='halberd')),
    'g_marcas': W('greatsword', 'Machado das Marcas', P('weapons/blunt/weapon_blunt_waraxe', variant='waraxe')),
    'g_muralhas': W('greatsword', 'Rompe-Muralhas', P('weapons/blunt/weapon_blunt_flail', variant='flail')),
    'g_rochedo': W('greatsword', 'Lâmina de Rochedo', P('weapons/polearm/weapon_polearm_halberd', variant='halberd')),
    'g_reis': W('greatsword', 'Fim dos Reis', P('weapons/polearm/weapon_polearm_scythe', variant='scythe')),
    'g_abismo': W('greatsword', 'Montante do Abismo', P('weapons/polearm/weapon_polearm_scythe', variant='scythe')),
    # arcos
    'b_temperado': W('bow', 'Arco Temperado', bow('normal', 'light')),
    'b_teixo': W('bow', 'Arco de Teixo', bow('normal', 'dark')),
    'b_runico': W('bow', 'Arco Rúnico', bow('recurve', 'silver')),
    'b_vento': W('bow', 'Arco do Vento Norte', bow('recurve', 'steel')),
    'b_sol': W('bow', 'Arco do Sol Poente', bow('great', 'gold')),
    'b_ysra': W('bow', 'Sussurro de Ysra', bow('great', 'silver')),
    'b_lua': W('bow', 'Arco da Lua Rubra', bow('great', 'red')),
    'b_estrelas': W('bow', 'Corda das Estrelas', bow('recurve', 'gold')),
    # cajados
    's_temperado': W('staff', 'Cajado Temperado', staff('loop', 'iron')),
    's_carvalho': W('staff', 'Bordão de Carvalho', staff('gnarled', 'light')),
    's_runico': W('staff', 'Cajado Rúnico', staff('crystal', 'blue')),
    's_pantano': W('staff', 'Vara do Pântano', staff('crystal', 'green')),
    's_brasa': W('staff', 'Cetro da Brasa', staff('crystal', 'orange')),
    's_ambar': W('staff', 'Cajado de Âmbar', staff('diamond', 'gold')),
    's_morvath': W('staff', 'Olho de Morvath', staff('crystal', 'purple')),
    's_rei': W('staff', 'Cetro do Primeiro Rei', staff('s', 'gold')),
}

# ------------------------------------------------------------------ herói
HERO_BODY = dict(sex='male', skin='light', hair='short/hair_messy2', hairc='dark_brown', eyes='green')


def O(name, desc, defense, speed, bonus, parts, nohair=False, base=None):
    return {'name': name, 'desc': desc, 'defense': defense, 'speed': speed, 'bonus': bonus, 'parts': parts, 'nohair': nohair, 'base': base}


HERO_OUTFITS = {
    # bases (ids antigos mantidos por causa dos saves)
    'squire': O('Gibão do Escudeiro', 'gibão de couro e malha', 0.2, 1.0, '', [shirt('maroon'), P('torso/torso_chainmail', color='iron'), leather('brown', 'brown'), pants('charcoal'), boots('brown'), P('arms/wrists/arms_bracers', color='iron'), belt('brown')]),
    'leather': O('Traje do Andarilho', 'couro leve e capa verde', 0.1, 1.0, '', [shirt('white'), leather('leather'), pants('brown'), boots('brown'), cape('forest'), hood('forest')]),
    'hunter': O('Couraça do Caçador', '6% mais rápido e esquiva recarrega 25% antes', 0.15, 1.06, 'dodge', [shirt('forest'), leather('walnut', 'brown'), pants('tan', 'pants/legs_pants2'), boots('brown', 'boots/feet_boots_fold'), P('arms/wrists/arms_bracers', color='leather'), P('arms/shoulders/shoulders_mantal', color='tan'), P('headwear/hats/caps/hat_cap_leather_feather', color='brown')]),
    'plate': O('Armadura de Placas', 'aço da cabeça aos pés', 0.45, 0.88, '', [shirt('gray'), *plate('steel'), P('arms/arms_gloves', color='steel'), helm('greathelm', 'steel')], nohair=True),
    'legion': O('Armadura Legionária', 'bronze, saiote e penacho', 0.3, 0.95, '', [shirt('maroon', 'shortsleeve/torso_clothes_tshirt'), P('legs/skirts/legs_skirts_legion', color='maroon'), P('torso/armour/torso_armour_legion', color='bronze'), P('arms/shoulders/shoulders_legion', color='bronze'), P('feet/feet_sandals', color='brown'), helm('legion', 'bronze'), acc('plumage_legion', 'red')], nohair=True),
    'arcane': O('Vestes Arcanas', 'habilidades recarregam 30% mais rápido', 0.0, 1.0, 'cooldown', [shirt('purple'), P('legs/pants/legs_formal', color='purple'), P('feet/shoes/feet_shoes_basic', color='black'), P('torso/jacket/torso_jacket_frock', variant='purple'), cape('purple'), P('headwear/hats/magic/hat_magic_wizard', variant='base_teal')]),
}
# armaduras raras: cada uma com a sua cara (a base dá os números)
RARE_OUTFITS = {
    'leather': [
        ('Couro Curtido', [shirt('tan'), leather('tan', 'walnut'), pants('walnut'), boots('walnut'), belt('walnut'), hood('tan')]),
        ('Gibão das Sombras', [shirt('black'), leather('black', 'charcoal'), pants('charcoal'), boots('black'), cape('black', 'tattered'), hood('black'), P('headwear/accessories/facial_mask_plain', color='black')]),
        ('Manto do Andarilho Eterno', [shirt('forest'), leather('walnut'), pants('forest'), boots('brown', 'boots/feet_boots_fold'), cape('green', 'tattered'), hood('green'), P('headwear/neck/charms/neck_gem_emerald', color='gold')]),
        ('Pele do Lobo Branco', [shirt('white'), leather('white', 'gray'), pants('gray'), boots('white', 'boots/feet_boots_rim'), P('arms/shoulders/shoulders_mantal', color='white'), cape('white'), hood('white')]),
    ],
    'hunter': [
        ('Couraça Reforçada', [shirt('brown'), leather('brown', 'black'), P('torso/torso_chainmail', color='iron'), pants('brown'), boots('black'), P('arms/wrists/arms_bracers', color='iron'), P('headwear/hats/caps/hat_cap_leather', color='brown')]),
        ('Couraça Rúnica', [shirt('navy'), leather('navy', 'black'), pants('navy'), boots('black'), P('arms/wrists/arms_bracers', color='silver'), P('arms/shoulders/shoulders_mantal', color='sky'), P('headwear/coverings/headbands/hat_headband_thick_rune', color='blue')]),
        ('Couraça do Falcão', [shirt('yellow'), leather('tan', 'brown'), pants('walnut'), boots('brown', 'boots/feet_boots_fold'), P('arms/wrists/arms_bracers', color='gold'), cape('orange'), P('headwear/hats/caps/hat_cap_cavalier_feather', color='orange')]),
        ('Couraça da Caçada Selvagem', [shirt('green'), leather('forest', 'brown'), pants('forest'), boots('brown', 'boots/feet_boots_fold'), P('arms/shoulders/shoulders_mantal', color='walnut'), cape('forest', 'tattered'), hood('forest')]),
    ],
    'plate': [
        ('Placas Temperadas', [shirt('gray'), *plate('iron'), P('arms/arms_gloves', color='iron'), helm('bascinet', 'iron')], True),
        ('Placas Rúnicas', [shirt('navy'), *plate('silver'), P('arms/arms_gloves', color='silver'), cape('blue'), helm('armet', 'silver')], True),
        ('Placas de Rochedo', [shirt('brown'), *plate('brass'), P('arms/shoulders/shoulders_pauldrons', color='brass'), P('arms/arms_gloves', color='brass'), cape('walnut'), helm('close', 'brass')], True),
        ('Armadura do Dragão Negro', [shirt('black'), *plate('iron'), P('arms/shoulders/shoulders_pauldrons', color='iron'), P('arms/arms_gloves', color='iron'), cape('maroon', 'tattered'), helm('horned', 'iron'), visor('horned', 'iron')], True),
    ],
    'legion': [
        ('Bronze Polido', [shirt('red', 'shortsleeve/torso_clothes_tshirt'), P('legs/skirts/legs_skirts_legion', color='red'), P('torso/armour/torso_armour_legion', color='copper'), P('arms/shoulders/shoulders_legion', color='copper'), P('feet/feet_sandals', color='brown'), helm('legion', 'copper'), acc('plumage_legion', 'red')], True),
        ('Legionária das Marcas', [shirt('green', 'shortsleeve/torso_clothes_tshirt'), P('legs/skirts/legs_skirts_legion', color='forest'), P('torso/armour/torso_armour_legion', color='steel'), P('arms/shoulders/shoulders_legion', color='steel'), P('feet/feet_sandals', color='brown'), cape('forest'), helm('legion', 'steel'), acc('plumage_legion', 'green')], True),
        ('Legionária do Sol', [shirt('yellow', 'shortsleeve/torso_clothes_tshirt'), P('legs/skirts/legs_skirts_legion', color='orange'), P('torso/armour/torso_armour_legion', color='gold'), P('arms/shoulders/shoulders_legion', color='gold'), P('feet/feet_sandals', color='brown'), cape('orange'), helm('legion', 'gold'), acc('crest', 'orange')], True),
        ('Couraça do Imperador', [shirt('purple', 'shortsleeve/torso_clothes_tshirt'), P('legs/skirts/legs_skirts_legion', color='purple'), P('torso/armour/torso_armour_legion', color='gold'), P('arms/shoulders/shoulders_legion', color='gold'), P('arms/arms_gloves', color='gold'), P('feet/feet_sandals', color='brown'), cape('purple'), helm('maximus', 'gold'), acc('plumage_centurion', 'purple')], True),
    ],
    'arcane': [
        ('Vestes do Aprendiz', [shirt('sky'), P('legs/pants/legs_formal', color='navy'), P('feet/shoes/feet_shoes_basic', color='brown'), P('torso/jacket/torso_jacket_frock', variant='blue'), P('headwear/hats/magic/hat_magic_wizard', variant='base_teal')]),
        ('Vestes Rúnicas', [shirt('navy'), P('legs/pants/legs_formal', color='navy'), P('feet/shoes/feet_shoes_basic', color='black'), P('torso/jacket/torso_jacket_frock', variant='navy'), cape('blue'), P('headwear/hats/magic/hat_magic_celestial', variant='blue')]),
        ('Vestes da Chama Velada', [shirt('red'), P('legs/pants/legs_formal', color='maroon'), P('feet/shoes/feet_shoes_basic', color='black'), P('torso/jacket/torso_jacket_frock', variant='red'), cape('red', 'tattered'), hood('red')]),
        ('Vestes do Vazio', [shirt('black'), P('legs/pants/legs_formal', color='black'), P('feet/shoes/feet_shoes_basic', color='black'), P('torso/jacket/torso_jacket_iverness', variant='black'), cape('purple'), P('headwear/hats/magic/hat_magic_celestial_moon', variant='black')]),
    ],
}


# ------------------------------------------------------------------ povos dos biomas
def T(warrior, archer, mage, nohair=(False, False, False)):
    return {'warrior': warrior, 'archer': archer, 'mage': mage, 'nohair': nohair}


# Cada povo: gente (corpo/rosto) por papel, 4 escalões e as armas por tipo e escalão.
FACTIONS = {
    # Vale de Vaelmor: milícia camponesa e guarda do vale — couro, verde e marrom
    0: {
        'name': 'Guarda do Vale',
        'people': [dict(skin='light', hair='short/hair_messy1', hairc='chestnut'), dict(skin='amber', hair='short/hair_parted', hairc='dark_brown', beard='beards/beards_trimmed'), dict(sex='female', skin='light', hair='braids/hair_ponytail', hairc='light_brown')],
        'tiers': [
            T([shirt('tan'), pants('brown'), P('feet/shoes/feet_shoes_basic', color='brown'), belt('brown'), P('headwear/hats/caps/hat_cap_leather', color='brown')],
              [shirt('forest'), pants('brown'), boots('brown'), belt('brown'), hood('forest')],
              [shirt('walnut'), pants('brown'), P('feet/shoes/feet_shoes_basic', color='brown'), hood('brown')]),
            T([shirt('tan'), leather('leather'), pants('brown'), boots('brown'), P('arms/wrists/arms_bracers', color='leather'), helm('kettle', 'iron')],
              [shirt('forest'), leather('walnut'), pants('brown'), boots('brown'), hood('forest'), P('torso/backpack/quiver', variant='quiver')],
              [shirt('forest'), pants('brown'), boots('brown'), P('torso/jacket/torso_jacket_frock', variant='forest'), hood('forest')]),
            T([shirt('forest'), P('torso/torso_chainmail', color='iron'), tabard('forest'), pants('brown'), boots('brown'), P('arms/arms_gloves', color='leather'), helm('nasal', 'iron')],
              [shirt('forest'), leather('walnut'), P('arms/shoulders/shoulders_mantal', color='forest'), pants('brown'), boots('brown', 'boots/feet_boots_fold'), cape('forest'), hood('forest'), P('torso/backpack/quiver', variant='quiver')],
              [shirt('green'), pants('forest'), boots('brown'), P('torso/jacket/torso_jacket_frock', variant='forest'), cape('forest'), P('headwear/hats/magic/hat_magic_wizard', variant='base_brown')]),
            T([shirt('forest'), *plate('steel'), cape('forest'), helm('bascinet', 'steel')],
              [shirt('forest'), P('torso/torso_chainmail', color='steel'), leather('forest'), pants('forest'), boots('brown', 'boots/feet_boots_fold'), cape('green'), hood('green'), P('torso/backpack/quiver', variant='quiver')],
              [shirt('green'), pants('forest'), boots('brown'), P('torso/jacket/torso_jacket_frock', variant='forest'), cape('green', 'tattered'), P('headwear/hats/magic/hat_magic_celestial', variant='forest')],
              (True, False, False)),
        ],
        'weapons': {
            'sword': [[arming('iron'), P('weapons/shields/shield_round', variant='brown')]] * 2 + [[arming('steel'), P('weapons/shields/shield_round', variant='green')]] * 2,
            'greatsword': [[P('weapons/polearm/weapon_polearm_spear', variant='iron')]] * 2 + [[P('weapons/polearm/weapon_polearm_halberd', variant='halberd')]] * 2,
            'bow': [[bow('normal', 'light')], [bow('normal', 'medium')], [bow('normal', 'dark')], [bow('recurve', 'medium')]],
            'staff': [[staff('simple', 'simple')], [staff('gnarled', 'light')], [staff('gnarled', 'medium')], [staff('crystal', 'green')]],
        },
    },
    # Greenland: ordem de cavaleiros — azul e branco, aço e brasões
    1: {
        'name': 'Ordem de Greenland',
        'people': [dict(skin='light', hair='short/hair_plain', hairc='blonde'), dict(skin='light', hair='short/hair_swoop', hairc='light_brown'), dict(sex='female', skin='light', hair='long/hair_long_straight', hairc='blonde')],
        'tiers': [
            T([shirt('sky'), tabard('blue'), pants('white', 'leggings/legs_hose'), boots('black'), belt('slate'), P('headwear/hats/caps/hat_cap_cavalier', color='blue')],
              [shirt('sky'), pants('white', 'leggings/legs_hose'), boots('black'), tabard('sky'), P('headwear/hats/caps/hat_cap_cavalier_feather', color='blue')],
              [shirt('white'), P('legs/pants/legs_formal', color='navy'), boots('black'), P('torso/jacket/torso_jacket_frock', variant='blue')]),
            T([shirt('sky'), P('torso/torso_chainmail', color='steel'), tabard('blue'), pants('white', 'leggings/legs_hose'), boots('black'), P('arms/arms_gloves', color='steel'), helm('bascinet_round', 'steel')],
              [shirt('sky'), P('torso/torso_chainmail', color='steel'), tabard('sky'), pants('white', 'leggings/legs_hose'), boots('black'), helm('mail', 'steel')],
              [shirt('white'), P('legs/pants/legs_formal', color='navy'), boots('black'), P('torso/jacket/torso_jacket_frock', variant='blue'), cape('blue'), P('headwear/hats/magic/hat_magic_wizard', variant='base_teal')]),
            T([shirt('navy'), *plate('silver'), cape('blue'), helm('armet', 'silver')],
              [shirt('sky'), P('torso/torso_chainmail', color='silver'), tabard('blue'), P('arms/arms_armour', color='silver'), pants('white', 'leggings/legs_hose'), boots('black'), cape('sky'), helm('nasal', 'silver')],
              [shirt('white'), P('legs/pants/legs_formal', color='navy'), boots('black'), P('torso/jacket/torso_jacket_frock', variant='navy'), cape('white'), P('headwear/hats/magic/hat_magic_celestial', variant='blue')],
              (True, False, False)),
            T([shirt('navy'), *plate('gold'), P('arms/shoulders/shoulders_pauldrons', color='gold'), cape('white'), helm('greathelm', 'silver'), acc('plumage', 'white')],
              [shirt('navy'), *plate('silver'), cape('white'), helm('barbuta', 'silver')],
              [shirt('white'), P('legs/pants/legs_formal', color='white'), boots('white', 'boots/feet_boots_rim'), P('torso/jacket/torso_jacket_frock', variant='white'), cape('blue'), P('headwear/hats/magic/hat_magic_celestial_moon', variant='white')],
              (True, True, False)),
        ],
        'weapons': {
            'sword': [[arming('steel'), P('weapons/shields/shield_kite', variant='kite blue gray')]] * 2 + [[arming('silver'), P('weapons/shields/shield_kite', variant='kite blue blue')]] * 2,
            'greatsword': [[P('weapons/sword/weapon_sword_longsword', variant='longsword')]] * 2 + [[P('weapons/polearm/weapon_polearm_halberd', variant='halberd')]] * 2,
            'bow': [[bow('recurve', 'light')], [bow('recurve', 'steel')], [bow('recurve', 'silver')], [bow('great', 'silver')]],
            'staff': [[staff('diamond', 'steel')], [staff('diamond', 'silver')], [staff('diamond', 'silver')], [staff('diamond', 'gold')]],
        },
    },
    # Snowland: clãs do norte — barbas, peles, chifres e machados
    2: {
        'name': 'Clãs de Snowland',
        'people': [dict(skin='light', hair='long/hair_long_messy', hairc='ginger', beard='beards/beards_winter'), dict(skin='light', hair='braids/hair_braid', hairc='platinum', beard='beards/beards_medium'), dict(sex='female', skin='light', hair='braids/hair_braid2', hairc='platinum')],
        'tiers': [
            T([shirt('gray', 'sleeveless/torso_clothes_sleeveless2'), pants('charcoal'), boots('gray', 'boots/feet_boots_rim'), P('arms/wrists/arms_bracers', color='leather'), P('arms/shoulders/shoulders_mantal', color='gray'), belt('charcoal')],
              [shirt('slate'), pants('charcoal'), boots('gray', 'boots/feet_boots_rim'), P('arms/shoulders/shoulders_mantal', color='white'), hood('gray')],
              [shirt('bluegray'), pants('charcoal'), boots('gray', 'boots/feet_boots_rim'), P('arms/shoulders/shoulders_mantal', color='white'), hood('bluegray')]),
            T([shirt('slate'), leather('charcoal', 'black'), P('arms/shoulders/shoulders_mantal', color='white'), pants('charcoal'), boots('gray', 'boots/feet_boots_rim'), P('arms/wrists/arms_bracers', color='iron'), helm('barbarian_nasal', 'iron')],
              [shirt('slate'), leather('charcoal', 'black'), P('arms/shoulders/shoulders_mantal', color='white'), pants('charcoal'), boots('gray', 'boots/feet_boots_rim'), helm('barbarian', 'iron'), P('torso/backpack/quiver', variant='quiver')],
              [shirt('bluegray'), pants('charcoal'), boots('gray', 'boots/feet_boots_rim'), P('arms/shoulders/shoulders_mantal', color='white'), cape('bluegray'), hood('white')]),
            T([shirt('slate'), P('torso/torso_chainmail', color='iron'), P('arms/shoulders/shoulders_mantal', color='white'), pants('charcoal'), boots('gray', 'boots/feet_boots_rim'), cape('gray'), helm('spangenhelm_viking', 'iron')],
              [shirt('slate'), P('torso/torso_chainmail', color='iron'), leather('charcoal', 'black'), P('arms/shoulders/shoulders_mantal', color='white'), pants('charcoal'), boots('gray', 'boots/feet_boots_rim'), cape('white'), helm('barbarian_viking', 'iron')],
              [shirt('sky'), pants('charcoal'), boots('white', 'boots/feet_boots_rim'), P('arms/shoulders/shoulders_mantal', color='white'), cape('sky'), P('headwear/hats/magic/hat_magic_wizard', variant='white')]),
            T([shirt('black'), *plate('iron'), P('arms/shoulders/shoulders_mantal', color='white'), cape('white', 'tattered'), helm('horned', 'iron')],
              [shirt('slate'), P('torso/torso_chainmail', color='steel'), P('arms/shoulders/shoulders_mantal', color='white'), pants('charcoal'), boots('white', 'boots/feet_boots_rim'), cape('white', 'tattered'), helm('spangenhelm_viking', 'steel'), acc('horns_upward', 'white')],
              [shirt('white'), pants('gray'), boots('white', 'boots/feet_boots_rim'), P('arms/shoulders/shoulders_mantal', color='white'), cape('white', 'tattered'), P('headwear/hats/magic/hat_magic_celestial_moon', variant='white')],
              (True, False, False)),
        ],
        'weapons': {
            'sword': [[P('weapons/blunt/weapon_blunt_waraxe', variant='waraxe'), P('weapons/shields/shield_round', variant='black')]] * 2 + [[P('weapons/blunt/weapon_blunt_waraxe', variant='waraxe'), P('weapons/shields/shield_round', variant='silver')]] * 2,
            'greatsword': [[P('weapons/polearm/weapon_polearm_longspear', variant='iron')]] * 2 + [[P('weapons/polearm/weapon_polearm_longspear', variant='steel')]] * 2,
            'bow': [[bow('great', 'light')], [bow('great', 'medium')], [bow('great', 'iron')], [bow('great', 'silver')]],
            'staff': [[staff('crystal', 'blue')]] * 4,
        },
    },
    # Blockland: a legião de pedra — bronze, saiotes, escudos retangulares
    3: {
        'name': 'Legião de Blockland',
        'people': [dict(skin='olive', hair='short/hair_buzzcut' if False else 'bald/hair_buzzcut', hairc='black'), dict(skin='amber', hair='curly/hair_curly_short', hairc='dark_brown', beard='beards/beards_trimmed'), dict(sex='female', skin='olive', hair='braids/hair_topknot_short', hairc='black')],
        'tiers': [
            T([shirt('white', 'shortsleeve/torso_clothes_tshirt'), P('legs/skirts/legs_skirts_legion', color='maroon'), P('feet/feet_sandals', color='brown'), belt('brown'), P('headwear/coverings/headbands/hat_headband_thick', color='maroon')],
              [shirt('white', 'shortsleeve/torso_clothes_tshirt'), P('legs/skirts/legs_skirts_legion', color='maroon'), P('feet/feet_sandals', color='brown'), belt('brown'), P('headwear/coverings/headbands/hat_headband_tied', color='maroon')],
              [shirt('white'), P('legs/skirts/legs_skirts_legion', color='white'), P('feet/feet_sandals', color='brown'), cape('maroon')]),
            T([shirt('maroon', 'shortsleeve/torso_clothes_tshirt'), P('legs/skirts/legs_skirts_legion', color='maroon'), P('torso/armour/torso_armour_legion', color='bronze'), P('feet/feet_sandals', color='brown'), helm('legion', 'bronze')],
              [shirt('maroon', 'shortsleeve/torso_clothes_tshirt'), P('legs/skirts/legs_skirts_legion', color='maroon'), leather('leather'), P('feet/feet_sandals', color='brown'), helm('legion', 'bronze')],
              [shirt('white'), P('legs/skirts/legs_skirts_legion', color='white'), P('feet/feet_sandals', color='brown'), cape('maroon'), P('headwear/coverings/headbands/hat_headband_thick_rune', color='maroon')]),
            T([shirt('maroon', 'shortsleeve/torso_clothes_tshirt'), P('legs/skirts/legs_skirts_legion', color='red'), P('torso/armour/torso_armour_legion', color='bronze'), P('arms/shoulders/shoulders_legion', color='bronze'), P('feet/feet_sandals', color='brown'), cape('red'), helm('legion', 'bronze'), acc('plumage_legion', 'red')],
              [shirt('maroon', 'shortsleeve/torso_clothes_tshirt'), P('legs/skirts/legs_skirts_legion', color='red'), P('torso/armour/torso_armour_legion', color='copper'), P('feet/feet_sandals', color='brown'), cape('maroon'), helm('legion', 'copper')],
              [shirt('white'), P('legs/skirts/legs_skirts_legion', color='white'), P('feet/feet_sandals', color='brown'), P('torso/armour/torso_armour_legion', color='bronze'), cape('red'), P('headwear/hats/magic/hat_magic_wizard', variant='base_red')]),
            T([shirt('red', 'shortsleeve/torso_clothes_tshirt'), P('legs/skirts/legs_skirts_legion', color='red'), P('torso/armour/torso_armour_legion', color='gold'), P('arms/shoulders/shoulders_legion', color='gold'), P('arms/arms_gloves', color='gold'), P('feet/feet_sandals', color='brown'), cape('red'), helm('maximus', 'gold'), acc('crest_centurion', 'red')],
              [shirt('red', 'shortsleeve/torso_clothes_tshirt'), P('legs/skirts/legs_skirts_legion', color='red'), P('torso/armour/torso_armour_legion', color='gold'), P('arms/shoulders/shoulders_legion', color='gold'), P('feet/feet_sandals', color='brown'), cape('red'), helm('legion', 'gold'), acc('plumage_legion', 'yellow')],
              [shirt('white'), P('legs/skirts/legs_skirts_legion', color='white'), P('feet/feet_sandals', color='brown'), P('torso/armour/torso_armour_legion', color='gold'), cape('purple'), P('headwear/hats/magic/hat_magic_celestial', variant='white')],
              (True, True, False)),
        ],
        'weapons': {
            'sword': [[arming('bronze'), P('weapons/shields/scutum/shield_scutum', variant='scutum')]] * 4,
            'greatsword': [[P('weapons/polearm/weapon_polearm_spear', variant='bronze')]] * 2 + [[P('weapons/polearm/weapon_polearm_dragonspear', variant='bronze')]] * 2,
            'bow': [[bow('normal', 'bronze')], [bow('normal', 'bronze')], [bow('recurve', 'bronze')], [bow('recurve', 'gold')]],
            'staff': [[staff('loop', 'bronze')], [staff('loop', 'bronze')], [staff('loop', 'brass')], [staff('loop', 'gold')]],
        },
    },
    # Blackland: a horda — orcos de pele verde, ferro escuro, capas rasgadas
    4: {
        'name': 'Horda de Blackland',
        'people': [dict(skin='green', head='orc'), dict(skin='dark_green', head='orc', hair='bald/hair_longhawk', hairc='black'), dict(sex='female', skin='green', head='orc', hair='long/hair_long_messy', hairc='black')],
        'tiers': [
            T([shirt('black', 'sleeveless/torso_clothes_sleeveless2'), pants('charcoal'), boots('black'), P('arms/wrists/arms_bracers', color='iron'), belt('charcoal')],
              [shirt('black', 'sleeveless/torso_clothes_sleeveless2'), pants('charcoal'), boots('black'), P('arms/wrists/arms_bracers', color='leather'), P('headwear/coverings/bandana/hat_bandana', color='maroon')],
              [shirt('maroon'), pants('black'), boots('black'), hood('black')]),
            T([shirt('black'), leather('black', 'charcoal'), pants('charcoal'), boots('black'), P('arms/shoulders/shoulders_pauldrons', color='iron'), helm('barbuta_simple', 'iron')],
              [shirt('black'), leather('black', 'charcoal'), pants('charcoal'), boots('black'), P('torso/backpack/quiver', variant='quiver'), hood('maroon')],
              [shirt('maroon'), pants('black'), boots('black'), cape('maroon', 'tattered'), hood('black'), P('headwear/neck/charms/neck_amulet_spider', color='silver')]),
            T([shirt('black'), *plate('iron'), P('arms/shoulders/shoulders_pauldrons', color='iron'), cape('maroon', 'tattered'), helm('barbuta', 'iron'), visor('pigface', 'iron')],
              [shirt('black'), P('torso/torso_chainmail', color='iron'), leather('black'), pants('charcoal'), boots('black'), cape('maroon', 'tattered'), helm('pointed', 'iron')],
              [shirt('black'), pants('black'), boots('black'), P('torso/jacket/torso_jacket_iverness', variant='black'), cape('red', 'tattered'), P('headwear/hats/magic/hat_magic_wizard', variant='base_black')],
              (True, True, False)),
            T([shirt('black'), *plate('iron'), P('arms/shoulders/shoulders_pauldrons', color='iron'), cape('red', 'tattered'), helm('horned', 'iron'), visor('horned', 'iron')],
              [shirt('black'), *plate('iron'), cape('red', 'tattered'), helm('xeon', 'iron')],
              [shirt('black'), pants('black'), boots('black'), P('torso/jacket/torso_jacket_iverness', variant='black'), cape('red', 'tattered'), P('headwear/hats/magic/hat_magic_celestial_moon', variant='black'), P('headwear/neck/charms/neck_amulet_spider', color='gold')],
              (True, True, False)),
        ],
        'weapons': {
            'sword': [[P('weapons/blunt/weapon_blunt_mace', variant='mace')]] * 2 + [[P('weapons/blunt/weapon_blunt_flail', variant='flail'), P('weapons/shields/shield_round', variant='black')]] * 2,
            'greatsword': [[P('weapons/polearm/weapon_polearm_scythe', variant='scythe')]] * 4,
            'bow': [[bow('normal', 'dark')], [bow('great', 'dark')], [bow('great', 'red')], [bow('great', 'red')]],
            'staff': [[staff('gnarled', 'dark')], [staff('gnarled', 'dark')], [staff('gnarled', 'red')], [staff('crystal', 'red')]],
        },
    },
    # Dustland: nômades do deserto — turbantes, véus, cimitarras; os campeões são escamados
    5: {
        'name': 'Nômades de Dustland',
        'people': [dict(skin='bronze', hair='short/hair_plain', hairc='black', beard='beards/beards_trimmed'), dict(skin='brown', hair='short/hair_plain', hairc='black'), dict(sex='female', skin='bronze', hair='long/hair_long', hairc='black')],
        'elite': dict(skin='amber', head='lizard'),
        'tiers': [
            T([shirt('tan'), pants('tan', 'pants/legs_pantaloons'), P('feet/feet_sandals', color='brown'), P('torso/waist/belt_sash', variant='brown'), P('headwear/coverings/hoods/hat_hood_hijab', color='tan')],
              [shirt('yellow'), pants('tan', 'pants/legs_pantaloons'), P('feet/feet_sandals', color='brown'), P('headwear/coverings/bandana/hat_bandana2', color='tan')],
              [shirt('white'), pants('white', 'pants/legs_pantaloons'), P('feet/feet_slippers', color='white'), P('headwear/coverings/hoods/hat_hood_hijab', color='white')]),
            T([shirt('tan'), leather('tan', 'walnut'), pants('tan', 'pants/legs_pantaloons'), P('feet/feet_sandals', color='brown'), P('torso/waist/belt_sash', variant='brown'), P('headwear/coverings/hoods/hat_hood_hijab', color='orange')],
              [shirt('yellow'), leather('tan'), pants('tan', 'pants/legs_pantaloons'), P('feet/feet_sandals', color='brown'), P('headwear/coverings/hoods/hat_hood_hijab', color='yellow')],
              [shirt('white'), pants('white', 'pants/legs_pantaloons'), P('feet/feet_slippers', color='white'), cape('orange'), P('headwear/coverings/hoods/hat_hood_hijab', color='white')]),
            T([shirt('orange'), P('torso/torso_chainmail', color='brass'), P('torso/waist/belt_sash', variant='black'), pants('tan', 'pants/legs_pantaloons'), boots('walnut', 'boots/feet_boots_fold'), cape('orange'), helm('morion', 'brass')],
              [shirt('orange'), leather('walnut', 'brown'), pants('tan', 'pants/legs_pantaloons'), boots('walnut', 'boots/feet_boots_fold'), cape('yellow'), P('headwear/coverings/hoods/hat_hood_hijab', color='orange')],
              [shirt('white'), pants('white', 'pants/legs_pantaloons'), P('feet/feet_slippers', color='white'), cape('yellow'), P('headwear/coverings/hoods/hat_hood_hijab', color='yellow'), P('headwear/neck/charms/neck_gem_round', color='gold')]),
            T([shirt('orange'), P('torso/armour/torso_armour_legion', color='gold'), P('arms/shoulders/shoulders_legion', color='gold'), pants('tan', 'pants/legs_pantaloons'), P('feet/feet_sandals', color='brown'), cape('yellow'), P('headwear/coverings/headbands/hat_headband_thick', color='orange')],
              [shirt('orange'), P('torso/torso_chainmail', color='gold'), leather('tan'), pants('tan', 'pants/legs_pantaloons'), P('feet/feet_sandals', color='brown'), cape('orange'), P('headwear/coverings/headbands/hat_headband_tied', color='yellow')],
              [shirt('yellow'), pants('white', 'pants/legs_pantaloons'), P('feet/feet_slippers', color='white'), P('torso/armour/torso_armour_legion', color='gold'), cape('yellow'), P('headwear/hats/formal/hat_formal_crown', color='gold')]),
        ],
        'weapons': {
            'sword': [[P('weapons/sword/weapon_sword_scimitar', variant='scimitar')]] * 2 + [[P('weapons/sword/weapon_sword_scimitar', variant='scimitar'), P('weapons/shields/shield_round', variant='gold')]] * 2,
            'greatsword': [[P('weapons/polearm/weapon_polearm_trident', variant='bronze')], [P('weapons/polearm/weapon_polearm_trident', variant='brass')], [P('weapons/polearm/weapon_polearm_trident', variant='gold')], [P('weapons/polearm/weapon_polearm_trident', variant='gold')]],
            'bow': [[bow('recurve', 'light')], [bow('recurve', 'brass')], [bow('recurve', 'gold')], [bow('recurve', 'gold')]],
            'staff': [[staff('s', 'brass')], [staff('s', 'bronze')], [staff('s', 'gold')], [staff('diamond', 'gold')]],
        },
    },
}

# o clã do jogador: roupas claras (o tom do clã tinge por cima), sobe com o treino da sede
ALLY = {
    'name': 'Clã do jogador',
    'people': [dict(skin='light', hair='short/hair_parted2', hairc='chestnut'), dict(skin='amber', hair='short/hair_messy3', hairc='dark_brown', beard='beards/beards_trimmed'), dict(sex='female', skin='light', hair='braids/hair_high_ponytail', hairc='redhead')],
    'tiers': [
        T([shirt('white'), pants('gray'), boots('brown'), belt('brown'), P('headwear/hats/caps/hat_cap_leather', color='white')],
          [shirt('white'), pants('gray'), boots('brown'), belt('brown'), hood('white')],
          [shirt('white'), pants('gray'), P('feet/shoes/feet_shoes_basic', color='brown'), hood('white')]),
        T([shirt('white'), leather('white', 'brown'), pants('gray'), boots('brown'), P('arms/wrists/arms_bracers', color='steel'), helm('kettle', 'steel', 'white')],
          [shirt('white'), leather('white', 'brown'), pants('gray'), boots('brown'), hood('white'), P('torso/backpack/quiver', variant='quiver')],
          [shirt('white'), pants('gray'), boots('brown'), P('torso/jacket/torso_jacket_frock', variant='white'), hood('white')]),
        T([shirt('white'), P('torso/torso_chainmail', color='steel'), tabard('white'), pants('gray'), boots('brown'), P('arms/arms_gloves', color='steel'), helm('nasal', 'steel')],
          [shirt('white'), P('torso/torso_chainmail', color='steel'), leather('white', 'brown'), pants('gray'), boots('brown'), cape('white'), hood('white'), P('torso/backpack/quiver', variant='quiver')],
          [shirt('white'), pants('gray'), boots('brown'), P('torso/jacket/torso_jacket_frock', variant='white'), cape('white'), P('headwear/hats/magic/hat_magic_wizard', variant='white')]),
        T([shirt('white'), *plate('steel'), cape('white'), helm('armet', 'steel'), acc('plumage', 'white')],
          [shirt('white'), P('torso/torso_chainmail', color='silver'), P('arms/arms_armour', color='silver'), leather('white', 'brown'), pants('gray'), boots('white', 'boots/feet_boots_rim'), cape('white'), helm('nasal', 'silver')],
          [shirt('white'), pants('white'), boots('white', 'boots/feet_boots_rim'), P('torso/jacket/torso_jacket_frock', variant='white'), cape('white'), P('headwear/hats/magic/hat_magic_celestial', variant='white')],
          (True, False, False)),
    ],
    'weapons': {
        'sword': [[arming('steel'), P('weapons/shields/shield_kite', variant='kite gray gray')]] * 4,
        'greatsword': [[P('weapons/sword/weapon_sword_longsword', variant='longsword')]] * 4,
        'bow': [[bow('normal', 'light')], [bow('normal', 'medium')], [bow('recurve', 'medium')], [bow('recurve', 'steel')]],
        'staff': [[staff('loop', 'steel')], [staff('loop', 'steel')], [staff('diamond', 'steel')], [staff('diamond', 'silver')]],
    },
}

# mercadores: um por cidade (o índice da cidade escolhe)
MERCHANTS = [
    (dict(skin='light', head='plump', hair='bald/hair_balding', hairc='gray', beard='mustaches/beards_walrus'), [shirt('white'), P('torso/clothes/vest' if False else 'torso/vest/torso_clothes_vest', variant='green striped'), P('torso/aprons/torso_aprons_apron', variant='leather'), pants('brown'), P('feet/shoes/feet_shoes_basic', color='brown'), P('headwear/hats/formal/hat_formal_bowler', color='brown')]),
    (dict(sex='female', skin='amber', hair='braids/hair_bangs_bun', hairc='chestnut'), [P('torso/shirts/torso_clothes_blouse_longsleeve', variant='green'), P('torso/dresses/dress_bodice', variant='brown'), P('torso/aprons/torso_aprons_apron_half', variant='forest'), P('feet/shoes/feet_shoes_basic', color='brown'), P('headwear/coverings/headbands/hat_headband_kerchief', color='green')]),
    (dict(skin='bronze', hair='short/hair_plain', hairc='black', beard='beards/beards_beard'), [shirt('orange'), pants('tan', 'pants/legs_pantaloons'), P('torso/waist/belt_sash', variant='black'), P('feet/feet_slippers', color='white'), P('torso/vest/torso_clothes_vest_open', variant='brown'), P('headwear/coverings/hoods/hat_hood_hijab', color='orange'), P('headwear/neck/charms/neck_gem_round', color='gold')]),
    (dict(skin='light', head='elder', hair='short/hair_mop', hairc='white', beard='beards/beards_winter'), [shirt('navy'), pants('charcoal'), P('torso/jacket/torso_jacket_frock', variant='brown'), P('feet/shoes/feet_shoes_basic', color='black'), P('headwear/hats/formal/hat_formal_tophat', color='black'), P('headwear/neck/neck_necklace_chain', color='gold')]),
    (dict(sex='female', skin='light', hair='long/hair_wavy', hairc='redhead'), [P('torso/shirts/torso_clothes_blouse', variant='lavender'), P('torso/dresses/dress_sash', variant='blue'), P('feet/shoes/feet_shoes_basic', color='black'), P('headwear/hats/caps/hat_cap_bonnie_feather', color='blue'), P('headwear/neck/charms/neck_gem_pearl', color='silver')]),
    (dict(skin='olive', head='plump', hair='curly/hair_curly_short', hairc='dark_brown', beard='mustaches/beards_handlebar'), [shirt('maroon'), P('torso/vest/torso_clothes_vest', variant='black'), pants('black'), boots('black'), P('torso/waist/belt_leather', variant='brown'), P('headwear/hats/tricorne/hat_tricorne', color='black')]),
]

# coletores da sede: roupa e ferramenta do ofício (madeira, pedra, fibra, minério, cristal)
WORKERS = {
    'wood': (dict(skin='light', hair='short/hair_messy1', hairc='ginger', beard='beards/beards_beard'), [shirt('red'), P('torso/aprons/torso_aprons_suspenders', variant='brown'), pants('navy'), boots('brown'), P('headwear/hats/caps/hat_cap_leather', color='brown')], P('tools/tool_axe', color_1='steel', color_2='oak')),
    'stone': (dict(skin='amber', hair='bald/hair_buzzcut', hairc='black', beard='beards/beards_5oclock_shadow'), [shirt('gray', 'sleeveless/torso_clothes_sleeveless2'), P('torso/aprons/torso_aprons_apron', variant='leather'), pants('brown'), boots('black'), P('headwear/coverings/bandana/hat_bandana2', color='gray'), P('arms/wrists/arms_bracers', color='leather')], P('tools/tool_pickaxe', color_1='iron', color_2='maple')),
    'fiber': (dict(sex='female', skin='light', hair='braids/hair_braid', hairc='blonde'), [P('torso/shirts/torso_clothes_blouse_longsleeve', variant='green'), P('legs/skirts/legs_skirts_plain', color='forest'), P('torso/aprons/torso_aprons_apron_half', variant='brown'), P('feet/shoes/feet_shoes_basic', color='brown'), P('headwear/coverings/headbands/hat_headband_kerchief', color='yellow')], P('tools/tool_hoe', color_1='iron', color_2='maple')),
    'ore': (dict(skin='brown', hair='short/hair_plain', hairc='black', beard='mustaches/beards_mustache'), [shirt('tan'), P('torso/aprons/torso_aprons_overalls', variant='blue'), boots('black'), helm('flattop', 'brass')], P('tools/tool_pickaxe', color_1='steel', color_2='walnut')),
    'crystal': (dict(skin='light', head='elder', hair='long/hair_long', hairc='white', beard='beards/beards_winter'), [shirt('purple'), pants('purple'), P('feet/shoes/feet_shoes_basic', color='black'), P('torso/jacket/torso_jacket_frock', variant='purple'), hood('lavender')], P('tools/tool_hammer', color_1='silver', color_2='walnut')),
}
