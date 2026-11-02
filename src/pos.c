#include <stdint.h>
#include <stdio.h>
#include <string.h>

#define POS_MAX_PRODUCTS 200
#define POS_MAX_CART_ITEMS 200
#define POS_NAME_SIZE 80
#define POS_SKU_SIZE 32
#define POS_MAX_STOCK 1000000
#define POS_MAX_QUANTITY 999
#define POS_MAX_PRICE_CENTS 100000000

typedef struct {
    int id;
    char name[POS_NAME_SIZE];
    char sku[POS_SKU_SIZE];
    int stock;
    int price_cents;
    int active;
} Product;

typedef struct {
    int product_id;
    int quantity;
} CartItem;

static Product products[POS_MAX_PRODUCTS];
static CartItem cart[POS_MAX_CART_ITEMS];
static int product_count;
static int cart_count;
static int next_product_id = 1;

static int find_product_index(int id) {
    for (int i = 0; i < product_count; i++) {
        if (products[i].active && products[i].id == id) return i;
    }
    return -1;
}

static int find_cart_index(int id) {
    for (int i = 0; i < cart_count; i++) {
        if (cart[i].product_id == id) return i;
    }
    return -1;
}

static int valid_product(const char *name, const char *sku, int stock, int price_cents) {
    return name && name[0] && strlen(name) < POS_NAME_SIZE &&
           sku && sku[0] && strlen(sku) < POS_SKU_SIZE &&
           stock >= 0 && stock <= POS_MAX_STOCK &&
           price_cents > 0 && price_cents <= POS_MAX_PRICE_CENTS;
}

static int sku_available(const char *sku, int except_id) {
    for (int i = 0; i < product_count; i++) {
        if (products[i].active && products[i].id != except_id &&
            strcmp(products[i].sku, sku) == 0) return 0;
    }
    return 1;
}

void pos_reset(void) {
    memset(products, 0, sizeof(products));
    memset(cart, 0, sizeof(cart));
    product_count = 0;
    cart_count = 0;
    next_product_id = 1;
}

int pos_add_product(const char *name, const char *sku, int stock, int price_cents) {
    if (!valid_product(name, sku, stock, price_cents) || !sku_available(sku, 0)) return 0;

    int slot = product_count;
    for (int i = 0; i < product_count; i++) {
        if (!products[i].active) {
            slot = i;
            break;
        }
    }
    if (slot == product_count) {
        if (product_count >= POS_MAX_PRODUCTS) return 0;
        product_count++;
    }

    Product *product = &products[slot];
    memset(product, 0, sizeof(*product));
    product->id = next_product_id++;
    snprintf(product->name, sizeof(product->name), "%s", name);
    snprintf(product->sku, sizeof(product->sku), "%s", sku);
    product->stock = stock;
    product->price_cents = price_cents;
    product->active = 1;
    return product->id;
}

int pos_update_product(int id, const char *name, const char *sku, int stock, int price_cents) {
    int index = find_product_index(id);
    int cart_index = find_cart_index(id);
    if (index < 0 || !valid_product(name, sku, stock, price_cents) ||
        !sku_available(sku, id) ||
        (cart_index >= 0 && cart[cart_index].quantity > stock)) return 0;

    Product *product = &products[index];
    snprintf(product->name, sizeof(product->name), "%s", name);
    snprintf(product->sku, sizeof(product->sku), "%s", sku);
    product->stock = stock;
    product->price_cents = price_cents;
    return 1;
}

int pos_remove_product(int id) {
    int index = find_product_index(id);
    if (index < 0) return 0;
    products[index].active = 0;

    int cart_index = find_cart_index(id);
    if (cart_index >= 0) {
        for (int i = cart_index; i < cart_count - 1; i++) cart[i] = cart[i + 1];
        cart_count--;
    }
    return 1;
}

int pos_product_count(void) {
    int count = 0;
    for (int i = 0; i < product_count; i++) count += products[i].active;
    return count;
}

int pos_product_id(int index) {
    int current = 0;
    for (int i = 0; i < product_count; i++) {
        if (!products[i].active) continue;
        if (current++ == index) return products[i].id;
    }
    return 0;
}

static Product *product_at(int index) {
    int id = pos_product_id(index);
    int product_index = find_product_index(id);
    return product_index < 0 ? NULL : &products[product_index];
}

const char *pos_product_name(int index) {
    Product *product = product_at(index);
    return product ? product->name : "";
}

const char *pos_product_sku(int index) {
    Product *product = product_at(index);
    return product ? product->sku : "";
}

int pos_product_stock(int index) {
    Product *product = product_at(index);
    return product ? product->stock : 0;
}

int pos_product_price_cents(int index) {
    Product *product = product_at(index);
    return product ? product->price_cents : 0;
}

int pos_set_cart_quantity(int id, int quantity) {
    int product_index = find_product_index(id);
    if (product_index < 0 || quantity < 0 || quantity > POS_MAX_QUANTITY ||
        quantity > products[product_index].stock) return 0;

    int cart_index = find_cart_index(id);
    if (quantity == 0) {
        if (cart_index >= 0) {
            for (int i = cart_index; i < cart_count - 1; i++) cart[i] = cart[i + 1];
            cart_count--;
        }
        return 1;
    }

    if (cart_index >= 0) {
        cart[cart_index].quantity = quantity;
        return 1;
    }
    if (cart_count >= POS_MAX_CART_ITEMS) return 0;
    cart[cart_count++] = (CartItem){id, quantity};
    return 1;
}

int pos_cart_count(void) {
    return cart_count;
}

int pos_cart_product_id(int index) {
    return index >= 0 && index < cart_count ? cart[index].product_id : 0;
}

int pos_cart_quantity(int index) {
    return index >= 0 && index < cart_count ? cart[index].quantity : 0;
}

void pos_clear_cart(void) {
    memset(cart, 0, sizeof(cart));
    cart_count = 0;
}

double pos_cart_subtotal_cents(void) {
    int64_t subtotal = 0;
    for (int i = 0; i < cart_count; i++) {
        int product_index = find_product_index(cart[i].product_id);
        if (product_index >= 0) {
            subtotal += (int64_t)products[product_index].price_cents * cart[i].quantity;
        }
    }
    return (double)subtotal;
}

double pos_cart_discount_cents(int discount_percent) {
    if (discount_percent < 0 || discount_percent > 100) return 0;
    int64_t subtotal = (int64_t)pos_cart_subtotal_cents();
    return (double)((subtotal * discount_percent + 50) / 100);
}

double pos_cart_tax_cents(int tax_basis_points, int discount_percent) {
    if (tax_basis_points < 0 || tax_basis_points > 10000 ||
        discount_percent < 0 || discount_percent > 100) return 0;
    int64_t subtotal = (int64_t)pos_cart_subtotal_cents();
    int64_t discount = (subtotal * discount_percent + 50) / 100;
    return (double)(((subtotal - discount) * tax_basis_points + 5000) / 10000);
}

int pos_checkout(void) {
    if (cart_count == 0) return 0;
    for (int i = 0; i < cart_count; i++) {
        int index = find_product_index(cart[i].product_id);
        if (index < 0 || products[index].stock < cart[i].quantity) return 0;
    }
    for (int i = 0; i < cart_count; i++) {
        int index = find_product_index(cart[i].product_id);
        products[index].stock -= cart[i].quantity;
    }
    cart_count = 0;
    return 1;
}

#ifdef POS_TEST
#include <assert.h>

int main(void) {
    pos_reset();
    int rice = pos_add_product("Gao ST25", "GAO-01", 10, 2500000);
    int milk = pos_add_product("Sua tuoi", "SUA-01", 5, 1800000);
    assert(rice == 1 && milk == 2);
    assert(pos_add_product("Duplicate", "GAO-01", 1, 1000) == 0);
    assert(pos_set_cart_quantity(rice, 2));
    assert(pos_set_cart_quantity(milk, 1));
    assert(pos_cart_count() == 2);
    assert(pos_cart_subtotal_cents() == 6800000);
    assert(pos_cart_tax_cents(800, 0) == 544000);
    assert(pos_cart_discount_cents(10) == 680000);
    assert(pos_cart_tax_cents(800, 10) == 489600);
    assert(!pos_set_cart_quantity(milk, 6));
    assert(pos_checkout());
    assert(pos_cart_count() == 0);
    assert(pos_product_stock(0) == 8);
    assert(pos_product_stock(1) == 4);
    assert(!pos_checkout());
    assert(pos_update_product(rice, "Gao ST25", "GAO-01", 7, 2600000));
    assert(pos_product_price_cents(0) == 2600000);
    assert(pos_remove_product(milk));
    assert(pos_product_count() == 1);
    int soap = pos_add_product("Xa phong", "XP-03", 2, 500000);
    assert(soap == 3 && pos_product_count() == 2);
    puts("POS core tests passed");
    return 0;
}
#endif
