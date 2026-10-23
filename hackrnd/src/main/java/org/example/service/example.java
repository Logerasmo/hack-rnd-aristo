package org.example.service;
public class example {
    public int sumUpTo(int n) {
        int sum = 0;
        for (int i = 1; i <= n; i++) {
            sum += i;
        }
        return sum;
    }

    // Метод 2: цикл while и условие if
    public String classify(int value) {
        int counter = 0;
        while (counter < value) {
            counter++;
        }
        if (counter > 10) {
            return "big";
        } else {
            return "small";
        }
    }

    // Метод 3: вложенные циклы
    public void printTable(int rows, int cols) {
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                System.out.print(r * c + " ");
            }
            System.out.println();
        }
    }

    // Метод 4: без циклов, только переменные и вызов метода
    public int doubleValue(int x) {
        int result = x * 2;
        return result;
    }
}
