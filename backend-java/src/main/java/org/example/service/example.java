package org.example.service;
public class example {

    public int process(int[] data, String mode) {
        int sum = 0;
        int errors = 0;

        if (data == null || data.length == 0) {
            return -1;
        } else if (data.length == 1) {
            sum = data[0];
        } else if (data.length < 5) {
            for (int i = 0; i < data.length; i++) {
                if (data[i] < 0) {
                    continue;
                }
                sum += data[i];
            }
        } else {
            int i = 0;
            while (i < data.length) {
                sum += data[i];
                i++;
            }
        }

        for (String m : mode.split(",")) {
            switch (m) {
                case "double":
                case "twice":
                    sum *= 2;
                    break;
                case "reset":
                    sum = 0;
                    break;
                case "log":
                    System.out.println("sum=" + sum);
                    break;
                default:
                    errors++;
            }
        }

        do {
            sum--;
            if (sum < 0) {
                break;
            }
        } while (sum > 100);

        synchronized (this) {
            try {
                if (sum == 0) {
                    throw new IllegalStateException("zero");
                }
                sum = sum / 2;
            } catch (IllegalStateException e) {
                errors++;
                sum = -1;
            } catch (ArithmeticException e) {
                errors += 2;
            } finally {
                System.out.println("done, errors=" + errors);
            }
        }

        return sum;
    }
}