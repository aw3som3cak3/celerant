// Swedish content labels for the session-start skill choice (motivation §3.2).
// Labelled by *content*, never lätt/svår — the child chooses what to practise,
// never how hard.

const EXACT: Record<string, string> = {
  add_within_10: 'plus till 10',
  add_doubles: 'dubblor',
  sub_within_10: 'minus till 10',
  missing_addend_10: 'tiokompisar',
  add_cross_10: 'plus över tiotalet',
  sub_cross_10: 'minus över tiotalet',
  bond_to_20: 'kompisar till 20',
  add_tens: 'hela tiotal',
  add_2d_no_carry: 'tvåsiffrigt plus',
  add_2d_carry: 'plus med minne',
  sub_2d_no_borrow: 'tvåsiffrigt minus',
  sub_2d_borrow: 'minus med lån',
  add_3d_no_carry: 'tresiffrigt plus',
  add_3d_carry_once: 'tresiffrigt plus med minne',
  add_3d_carry_twice: 'tresiffrigt plus, två minnen',
  sub_3d_borrow: 'tresiffrigt minus',
  sub_3d_borrow_across_zero: 'låna över nollan',
  mult_mixed: 'gånger blandat',
  mult_by_powers_of_ten: 'gånger 10, 100, 1000',
  mult_2d_by_1d_no_carry: 'tvåsiffrigt gånger',
  mult_2d_by_1d_carry: 'tvåsiffrigt gånger med minne',
  div_mixed: 'delat blandat',
  missing_factor: 'sök faktorn',
  div_2d_by_1d_exact: 'tvåsiffrigt delat',
  ooo_mult_then_add: 'gånger före plus',
  ooo_add_then_mult: 'gånger före plus',
  ooo_parentheses: 'parenteser',
  ooo_three_ops: 'räkneordning',
  neg_sub_to_negative: 'under noll',
  neg_add_pos: 'negativa tal',
  neg_add_neg: 'negativa tal',
  neg_sub_neg: 'minus minus',
  neg_mult_pos_neg: 'tecken vid gånger',
  neg_mult_neg_neg: 'tecken vid gånger',
  neg_div: 'tecken vid delat',
  frac_of_quantity: 'del av antal',
  frac_equivalent: 'liknämniga bråk',
  frac_simplify: 'förkorta bråk',
  frac_add_same_denom: 'bråk plus',
  frac_sub_same_denom: 'bråk minus',
  frac_add_unlike_denom: 'bråk, olika nämnare',
  frac_mult: 'bråk gånger',
  lin_x_plus_a: 'x + a = b',
  lin_x_minus_a: 'x − a = b',
  lin_a_minus_x: 'a − x = b',
  lin_ax: 'ax = b',
  lin_x_over_a: 'x / a = b',
  lin_ax_plus_b: 'ax + b = c',
  lin_ax_minus_b: 'ax − b = c',
  lin_neg_solution: 'ekvation, negativt svar',
  lin_neg_coefficient: 'ekvation, negativ faktor',
  lin_x_over_a_plus_b: 'x / a + b = c',
  lin_a_paren_x_plus_b: 'a(x + b) = c',
  lin_x_both_sides: 'x på båda sidor',
  lin_paren_both_sides: 'parentes, båda sidor',
};

export function skillLabel(code: string): string {
  if (EXACT[code]) return EXACT[code];
  const mult = code.match(/^mult_table_(\d+)$/);
  if (mult) return `× ${mult[1]}`;
  const div = code.match(/^div_table_(\d+)$/);
  if (div) return `÷ ${div[1]}`;
  return code.replace(/_/g, ' ');
}
