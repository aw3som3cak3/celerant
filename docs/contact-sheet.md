# Contact sheet

Five draws per skill. You are looking for three things only:

1. Would a child meet this problem?
2. Does one skill contain two competences? (some draws carry, some don't → split it)
3. Is the `year` tag plausible?

You are **not** checking the arithmetic. `verify.ts` does that, on 500 draws each.

| skill | year | mode | requires | five draws |
|---|---|---|---|---|
| `add_within_10` | 1 | c | — | 5 + 3 = 8 · 3 + 4 = 7 · 1 + 3 = 4 · 4 + 6 = 10 · 1 + 8 = 9 |
| `add_doubles` | 1 | c | `add_within_10` | 7 + 7 = 14 · 6 + 6 = 12 · 4 + 4 = 8 · 2 + 2 = 4 · 3 + 3 = 6 |
| `sub_within_10` | 1 | c | `add_within_10` | 7 − 5 = 2 · 10 − 1 = 9 · 5 − 1 = 4 · 7 − 1 = 6 · 9 − 5 = 4 |
| `missing_addend_10` | 1 | c | `sub_within_10` | 3 + □ = 10 7 · 6 + □ = 10 4 · 7 + □ = 10 3 · 2 + □ = 10 8 · 9 + □ = 10 1 |
| `add_cross_10` | 1 | c | `missing_addend_10` | 8 + 6 = 14 · 8 + 8 = 16 · 8 + 7 = 15 · 8 + 6 = 14 · 8 + 7 = 15 |
| `sub_cross_10` | 1 | c | `add_cross_10` | 11 − 3 = 8 · 15 − 7 = 8 · 14 − 8 = 6 · 13 − 9 = 4 · 11 − 4 = 7 |
| `bond_to_20` | 1 | c | `add_cross_10` | 13 + □ = 20 7 · 15 + □ = 20 5 · 19 + □ = 20 1 · 18 + □ = 20 2 · 11 + □ = 20 9 |
| `add_tens` | 1 | c | `add_within_10` | 30 + 50 = 80 · 60 + 30 = 90 · 70 + 20 = 90 · 60 + 20 = 80 · 60 + 20 = 80 |
| `add_2d_no_carry` | 2 | c | `add_tens` `add_within_10` | 13 + 13 = 26 · 52 + 33 = 85 · 53 + 41 = 94 · 44 + 11 = 55 · 47 + 11 = 58 |
| `add_2d_carry` | 2 | c | `add_2d_no_carry` `add_cross_10` | 25 + 86 = 111 · 32 + 74 = 106 · 63 + 61 = 124 · 64 + 75 = 139 · 56 + 67 = 123 |
| `sub_2d_no_borrow` | 2 | c | `add_2d_no_carry` `sub_within_10` | 26 − 20 = 6 · 83 − 21 = 62 · 89 − 57 = 32 · 26 − 12 = 14 · 95 − 44 = 51 |
| `sub_2d_borrow` | 3 | c | `sub_2d_no_borrow` `sub_cross_10` | 96 − 28 = 68 · 21 − 14 = 7 · 61 − 59 = 2 · 91 − 66 = 25 · 52 − 26 = 26 |
| `add_3d_no_carry` | 3 | c | `add_2d_no_carry` | 400 + 157 = 557 · 206 + 201 = 407 · 302 + 355 = 657 · 327 + 411 = 738 · 112 + 235 = 347 |
| `add_3d_carry_once` | 3 | c | `add_3d_no_carry` `add_2d_carry` | 298 + 140 = 438 · 494 + 122 = 616 · 409 + 152 = 561 · 326 + 154 = 480 · 315 + 137 = 452 |
| `add_3d_carry_twice` | 3 | c | `add_3d_carry_once` | 238 + 187 = 425 · 548 + 184 = 732 · 371 + 179 = 550 · 347 + 197 = 544 · 165 + 196 = 361 |
| `sub_3d_borrow` | 3 | c | `sub_2d_borrow` `add_3d_no_carry` | 733 − 150 = 583 · 568 − 173 = 395 · 795 − 119 = 676 · 623 − 199 = 424 · 663 − 189 = 474 |
| `sub_3d_borrow_across_zero` | 4 | c | `sub_3d_borrow` | 300 − 35 = 265 · 702 − 55 = 647 · 901 − 12 = 889 · 401 − 11 = 390 · 202 − 12 = 190 |
| `mult_table_2` | 2 | c | `add_doubles` | 2 × 3 = 6 · 2 × 3 = 6 · 2 × 12 = 24 · 2 × 4 = 8 · 2 × 3 = 6 |
| `mult_table_5` | 2 | c | `mult_table_2` | 5 × 3 = 15 · 5 × 11 = 55 · 5 × 11 = 55 · 5 × 2 = 10 · 5 × 3 = 15 |
| `mult_table_10` | 2 | c | `mult_table_2` | 10 × 3 = 30 · 10 × 4 = 40 · 10 × 8 = 80 · 10 × 12 = 120 · 10 × 5 = 50 |
| `mult_table_3` | 3 | c | `mult_table_2` | 3 × 3 = 9 · 3 × 2 = 6 · 3 × 4 = 12 · 3 × 3 = 9 · 3 × 7 = 21 |
| `mult_table_4` | 3 | c | `mult_table_2` | 4 × 3 = 12 · 4 × 12 = 48 · 4 × 8 = 32 · 4 × 3 = 12 · 4 × 11 = 44 |
| `mult_table_6` | 3 | c | `mult_table_2` | 6 × 3 = 18 · 6 × 10 = 60 · 6 × 4 = 24 · 6 × 2 = 12 · 6 × 7 = 42 |
| `mult_table_7` | 4 | c | `mult_table_2` | 7 × 3 = 21 · 7 × 9 = 63 · 7 × 7 = 49 · 7 × 2 = 14 · 7 × 11 = 77 |
| `mult_table_8` | 4 | c | `mult_table_2` | 8 × 3 = 24 · 8 × 8 = 64 · 8 × 11 = 88 · 8 × 12 = 96 · 8 × 3 = 24 |
| `mult_table_9` | 4 | c | `mult_table_2` | 9 × 3 = 27 · 9 × 7 = 63 · 9 × 3 = 27 · 9 × 12 = 108 · 9 × 7 = 63 |
| `mult_table_11` | 4 | c | `mult_table_2` | 11 × 3 = 33 · 11 × 3 = 33 · 11 × 12 = 132 · 11 × 11 = 121 · 11 × 9 = 99 |
| `mult_table_12` | 4 | c | `mult_table_2` | 12 × 3 = 36 · 12 × 2 = 24 · 12 × 4 = 48 · 12 × 11 = 132 · 12 × 2 = 24 |
| `mult_mixed` | 4 | c | `mult_table_2` `mult_table_3` `mult_table_4` `mult_table_5` `mult_table_6` `mult_table_7` `mult_table_8` `mult_table_9` | 5 × 4 = 20 · 7 × 9 = 63 · 6 × 3 = 18 · 9 × 4 = 36 · 3 × 7 = 21 |
| `mult_by_powers_of_ten` | 4 | c | `mult_table_10` | 11 × 1000 = 11000 · 48 × 100 = 4800 · 54 × 10 = 540 · 22 × 1000 = 22000 · 93 × 100 = 9300 |
| `mult_2d_by_1d_no_carry` | 4 | c | `mult_mixed` `add_2d_no_carry` | 32 × 2 = 64 · 40 × 2 = 80 · 24 × 2 = 48 · 11 × 4 = 44 · 30 × 3 = 90 |
| `mult_2d_by_1d_carry` | 5 | c | `mult_2d_by_1d_no_carry` `add_2d_carry` | 33 × 4 = 132 · 66 × 8 = 528 · 85 × 7 = 595 · 23 × 6 = 138 · 25 × 9 = 225 |
| `div_table_2` | 3 | c | `mult_table_2` | 24 / 2 = 12 · 18 / 2 = 9 · 4 / 2 = 2 · 20 / 2 = 10 · 22 / 2 = 11 |
| `div_table_5` | 3 | c | `mult_table_5` | 60 / 5 = 12 · 30 / 5 = 6 · 60 / 5 = 12 · 45 / 5 = 9 · 55 / 5 = 11 |
| `div_table_10` | 3 | c | `mult_table_10` | 60 / 10 = 6 · 100 / 10 = 10 · 80 / 10 = 8 · 30 / 10 = 3 · 50 / 10 = 5 |
| `div_table_3` | 4 | c | `mult_table_3` | 36 / 3 = 12 · 24 / 3 = 8 · 15 / 3 = 5 · 30 / 3 = 10 · 9 / 3 = 3 |
| `div_table_4` | 4 | c | `mult_table_4` | 48 / 4 = 12 · 28 / 4 = 7 · 36 / 4 = 9 · 40 / 4 = 10 · 28 / 4 = 7 |
| `div_table_6` | 4 | c | `mult_table_6` | 72 / 6 = 12 · 30 / 6 = 5 · 30 / 6 = 5 · 54 / 6 = 9 · 18 / 6 = 3 |
| `div_table_7` | 5 | c | `mult_table_7` | 84 / 7 = 12 · 28 / 7 = 4 · 56 / 7 = 8 · 56 / 7 = 8 · 49 / 7 = 7 |
| `div_table_8` | 5 | c | `mult_table_8` | 96 / 8 = 12 · 24 / 8 = 3 · 96 / 8 = 12 · 64 / 8 = 8 · 88 / 8 = 11 |
| `div_table_9` | 5 | c | `mult_table_9` | 108 / 9 = 12 · 18 / 9 = 2 · 36 / 9 = 4 · 72 / 9 = 8 · 27 / 9 = 3 |
| `div_table_11` | 5 | c | `mult_table_11` | 66 / 11 = 6 · 99 / 11 = 9 · 121 / 11 = 11 · 22 / 11 = 2 · 99 / 11 = 9 |
| `div_table_12` | 5 | c | `mult_table_12` | 72 / 12 = 6 · 96 / 12 = 8 · 48 / 12 = 4 · 24 / 12 = 2 · 144 / 12 = 12 |
| `div_mixed` | 5 | c | `div_table_2` `div_table_3` `div_table_4` `div_table_5` `div_table_6` `div_table_7` `div_table_8` `div_table_9` | 27 / 3 = 9 · 8 / 4 = 2 · 24 / 3 = 8 · 45 / 9 = 5 · 24 / 8 = 3 |
| `missing_factor` | 5 | c | `div_mixed` | 3 × □ = 9 3 · 4 × □ = 36 9 · 3 × □ = 36 12 · 4 × □ = 16 4 · 3 × □ = 36 12 |
| `div_2d_by_1d_exact` | 5 | c | `div_mixed` `mult_2d_by_1d_carry` | 77 / 7 = 11 · 180 / 9 = 20 · 33 / 3 = 11 · 115 / 5 = 23 · 104 / 8 = 13 |
| `ooo_mult_then_add` | 5 | c | `mult_mixed` `add_2d_carry` | 2 × 2 + 7 = 11 · 3 × 5 + 11 = 26 · 3 × 9 + 7 = 34 · 4 × 8 + 6 = 38 · 3 × 9 + 19 = 46 |
| `ooo_add_then_mult` | 5 | c | `ooo_mult_then_add` | 13 + 7 × 3 = 34 · 17 + 2 × 8 = 33 · 17 + 5 × 7 = 52 · 4 + 9 × 9 = 85 · 4 + 4 × 8 = 36 |
| `ooo_parentheses` | 5 | c | `ooo_add_then_mult` | 4 × (2 + 8) = 40 · 8 × (3 + 8) = 88 · 4 × (2 + 5) = 28 · 3 × (8 + 2) = 30 · 8 × (6 + 8) = 112 |
| `ooo_three_ops` | 6 | c | `ooo_parentheses` `div_mixed` | 3 × 4 − 16 / 4 = 8 · 5 × 3 − 24 / 4 = 9 · 4 × 9 − 8 / 2 = 32 · 2 × 7 − 4 / 2 = 12 · 2 × 4 − 9 / 3 = 5 |
| `neg_sub_to_negative` | 6 | c | `sub_cross_10` | 5 − 10 = -5 · 3 − 11 = -8 · 6 − 14 = -8 · 4 − 13 = -9 · 5 − 14 = -9 |
| `neg_add_pos` | 6 | c | `neg_sub_to_negative` | −8 + 15 = 7 · −6 + 11 = 5 · −7 + 2 = -5 · −3 + 2 = -1 · −2 + 14 = 12 |
| `neg_add_neg` | 6 | c | `neg_add_pos` | −9 + (−12) = -21 · −7 + (−9) = -16 · −5 + (−10) = -15 · −3 + (−12) = -15 · −2 + (−4) = -6 |
| `neg_sub_neg` | 6 | c | `neg_add_neg` | −9 − (−5) = -4 · 5 − (−5) = 10 · 1 − (−2) = 3 · 1 − (−9) = 10 · −5 − (−3) = -2 |
| `neg_mult_pos_neg` | 6 | c | `neg_add_pos` `mult_mixed` | 6 × (−2) = -12 · 2 × (−2) = -4 · 5 × (−7) = -35 · 3 × (−5) = -15 · 3 × (−9) = -27 |
| `neg_mult_neg_neg` | 6 | c | `neg_mult_pos_neg` | (−4) × (−2) = 8 · (−4) × (−4) = 16 · (−5) × (−8) = 40 · (−3) × (−3) = 9 · (−9) × (−8) = 72 |
| `neg_div` | 6 | c | `neg_mult_neg_neg` `div_mixed` | 24 / −6 = -4 · −28 / 4 = -7 · −28 / 7 = -4 · 28 / −7 = -4 · −32 / 4 = -8 |
| `frac_of_quantity` | 5 | c | `div_mixed` | 4/5 av 40 = 32 · 4/5 av 15 = 12 · 1/2 av 14 = 7 · 2/3 av 21 = 14 · 2/4 av 16 = 8 |
| `frac_equivalent` | 5 | c | `mult_mixed` | 2/7 = □/28 8 · 4/8 = □/24 12 · 3/8 = □/40 15 · 5/6 = □/36 30 · 1/7 = □/28 4 |
| `frac_simplify` | 6 | c | `frac_equivalent` `div_mixed` | Förkorta 10/16 5/8 · Förkorta 6/14 3/7 · Förkorta 12/32 3/8 · Förkorta 3/18 1/6 · Förkorta 20/45 4/9 |
| `frac_add_same_denom` | 5 | c | `frac_equivalent` | 9/11 + 1/11 = 10/11 · 1/10 + 7/10 = 4/5 · 9/11 + 1/11 = 10/11 · 1/3 + 1/3 = 2/3 · 1/7 + 4/7 = 5/7 |
| `frac_sub_same_denom` | 5 | c | `frac_add_same_denom` | 9/10 − 1/10 = 4/5 · 2/3 − 1/3 = 1/3 · 6/7 − 2/7 = 4/7 · 6/11 − 3/11 = 3/11 · 2/9 − 1/9 = 1/9 |
| `frac_add_unlike_denom` | 6 | c | `frac_add_same_denom` `frac_simplify` | 2/4 + 1/5 = 7/10 · 2/3 + 2/5 = 16/15 · 5/6 + 1/7 = 41/42 · 2/3 + 2/4 = 7/6 · 1/3 + 3/7 = 16/21 |
| `frac_mult` | 6 | c | `frac_simplify` | 4/5 × 5/7 = 4/7 · 3/7 × 5/7 = 15/49 · 4/6 × 1/6 = 1/9 · 4/7 × 5/7 = 20/49 · 2/8 × 1/5 = 1/20 |
| `lin_x_plus_a` | 6 | c | `sub_2d_borrow` `missing_addend_10` | x + 7 = 17 10 · x + 7 = 18 11 · x + 8 = 12 4 · x + 5 = 10 5 · x + 8 = 13 5 |
| `lin_x_minus_a` | 6 | c | `lin_x_plus_a` | x − 1 = 12 13 · x − 9 = 1 10 · x − 6 = 6 12 · x − 6 = -2 4 · x − 1 = 10 11 |
| `lin_a_minus_x` | 7 | c | `lin_x_minus_a` | 3 − x = 1 2 · 17 − x = 8 9 · 8 − x = 1 7 · 9 − x = 5 4 · 8 − x = 4 4 |
| `lin_ax` | 6 | c | `div_mixed` | 9x = 99 11 · 5x = 25 5 · 3x = 21 7 · 6x = 24 4 · 4x = 12 3 |
| `lin_x_over_a` | 7 | c | `lin_ax` | x / 4 = 3 12 · x / 2 = 7 14 · x / 2 = 9 18 · x / 6 = 8 48 · x / 6 = 2 12 |
| `lin_ax_plus_b` | 7 | c | `lin_ax` `lin_x_plus_a` `mult_2d_by_1d_carry` | 4x + 11 = 31 5 · 5x + 7 = 27 4 · 4x + 2 = 22 5 · 7x + 5 = 47 6 · 4x + 4 = 28 6 |
| `lin_ax_minus_b` | 7 | c | `lin_ax_plus_b` | 4x − 6 = 30 9 · 2x − 11 = 1 6 · 7x − 7 = 7 2 · 6x − 12 = 24 6 · 5x − 11 = 39 10 |
| `lin_neg_solution` | 8 | c | `lin_ax_minus_b` `neg_div` | 3x + 4 = −8 -4 · 5x + 11 = 6 -1 · 6x + 10 = −2 -2 · 6x + 5 = −19 -4 · 2x + 2 = −8 -5 |
| `lin_neg_coefficient` | 8 | c | `lin_neg_solution` `neg_mult_neg_neg` | −5x + 12 = 42 -6 · −4x + 5 = 13 -2 · −3x + 6 = 24 -6 · −3x + 4 = 13 -3 · −2x + 7 = 13 -3 |
| `lin_x_over_a_plus_b` | 8 | c | `lin_x_over_a` `lin_ax_plus_b` | x / 2 + 8 = 16 16 · x / 5 + 8 = 11 15 · x / 2 + 9 = 17 16 · x / 4 + 7 = 14 28 · x / 5 + 4 = 10 30 |
| `lin_a_paren_x_plus_b` | 8 | c | `lin_ax_plus_b` `ooo_parentheses` | 2(x + 1) = 8 3 · 3(x + 3) = 36 9 · 6(x + 6) = 66 5 · 4(x + 6) = 56 8 · 5(x + 2) = 15 1 |
| `lin_x_both_sides` | 8 | c | `lin_ax_plus_b` `neg_add_pos` | 6x + 3 = 3x + 9 2 · 8x + 2 = 6x + 8 3 · 4x + 8 = 2x + 10 1 · 5x − 3 = 2x + 15 6 · 4x + 8 = 2x + 24 8 |
| `lin_paren_both_sides` | 8 | c | `lin_x_both_sides` `lin_a_paren_x_plus_b` | 4(x − 2) = 2x − 12 -2 · 4(x − 3) = 2x − 20 -4 · 5(x + 4) = 2x + 5 -5 · 7(x − 5) = 4x − 23 4 · 4(x + 1) = 2x − 8 -6 |

