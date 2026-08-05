import * as moment from 'moment';

export const timestampWithTimezone = (date?: Date): string => {
  const currentDate = date || new Date();
  const formattedDate = moment(currentDate).format(
    'YYYY-MM-DD HH:mm:ss.SSSSSSZ',
  );
  return formattedDate;
};

export const birthYearToAge = (birthYear: string): string => {
  const currentYear = new Date().getFullYear();
  const yearBorn = parseFloat(birthYear);

  if (isNaN(yearBorn)) {
    return '0';
  }

  const age = currentYear - yearBorn;
  return age.toString();
};
